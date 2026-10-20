import { environment } from '../../config/environment';
import { DemoIdentity, LoginInput } from '../../types/auth';
import { Appointment, AppointmentStatus, TimeWindow, VisitDetails } from '../../types/domain';
import { ApiError } from '../errors';

const TIMEOUT_MS = 30_000;
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export type VerificationPurpose = 'activation' | 'registration';

export interface VerificationStarted {
  verificationId: string;
  message: string;
  resendInSeconds: number;
}

/** What a verified email can do. Decided by the backend only after the code is correct. */
export interface VerificationResult {
  purpose: VerificationPurpose;
  status:
    | 'READY'
    | 'ALREADY_ACTIVATED'
    | 'ALREADY_REGISTERED'
    | 'NO_MATCH'
    | 'MULTIPLE_MATCHES'
    | 'EXISTING_CUSTOMER';
  message: string;
  firstName?: string;
}

export interface RegistrationDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/** One visit as the backend sends it. The appointment number is its only identifier. */
interface AppointmentDto {
  reference: string;
  serviceName: string;
  workType: string | null;
  status: AppointmentStatus;
  statusDetail: string | null;
  scheduled: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  requestedWindow: TimeWindow;
  arrivalWindow: TimeWindow | null;
  duration: VisitDetails['duration'];
  address: Appointment['address'] | null;
  territory: string | null;
  cleaners: string[];
  notes: string | null;
  cancellationReason: string | null;
}

const toAppointment = (a: AppointmentDto): Appointment => ({
  id: a.reference,
  reference: a.reference,
  source: 'salesforce',
  serviceName: a.serviceName,
  scheduledStart: a.scheduledStart,
  scheduledEnd: a.scheduledEnd,
  status: a.status,
  address: a.address ?? { line1: '', city: '', state: '', postalCode: '' },
  crewName: a.cleaners.length ? a.cleaners.join(', ') : 'To be assigned',
  price: 0,
  // Read-only for now: changes to real visits are not connected, so the buttons stay disabled.
  actions: { canReschedule: false, canSkip: false, canCancel: false, canAddService: false },
  policy:
    'Online changes for this visit are coming soon. To reschedule, skip or cancel, message Maid Bright.',
  addons: [],
  visit: {
    scheduled: a.scheduled,
    statusDetail: a.statusDetail,
    workType: a.workType,
    territory: a.territory,
    requestedWindow: a.requestedWindow,
    arrivalWindow: a.arrivalWindow,
    duration: a.duration,
    hasAddress: Boolean(a.address),
    cleaners: a.cleaners,
    notes: a.notes,
    cancellationReason: a.cancellationReason,
  },
});

/**
 * Customer login and onboarding through the Maid Bright backend. The session lives in an HttpOnly cookie
 * that this code cannot read. Passwords, one-time codes and Salesforce IDs are never stored in the app.
 */
export class BackendAuthService {
  constructor(private baseUrl = environment.backendUrl) {}

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${this.baseUrl}/api/customer${path}`, {
        ...init,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new ApiError(
        'BACKEND_UNAVAILABLE',
        'We could not reach Maid Bright. Check your connection and try again.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async fail(response: Response): Promise<never> {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      attemptsRemaining?: number;
    } | null;
    const attempts =
      body?.attemptsRemaining !== undefined
        ? ` ${body.attemptsRemaining} ${body.attemptsRemaining === 1 ? 'try' : 'tries'} left.`
        : '';
    throw new ApiError(
      body?.error ?? 'REQUEST_FAILED',
      `${body?.message ?? 'Something went wrong. Please try again.'}${attempts}`,
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.request(path, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) return this.fail(response);
    return (await response.json()) as T;
  }

  async logIn(input: LoginInput): Promise<DemoIdentity> {
    const email = input.email.trim();
    if (!validEmail(email) || !input.password)
      throw new ApiError('INVALID_LOGIN', 'Enter a valid email address and your password.');
    return (
      await this.post<{ customer: DemoIdentity }>('/login', { email, password: input.password })
    ).customer;
  }

  /** The signed-in customer, or null when there is no valid session. */
  async currentCustomer(): Promise<DemoIdentity | null> {
    const response = await this.request('/me');
    if (response.status === 401) return null;
    if (!response.ok) return this.fail(response);
    return ((await response.json()) as { customer: DemoIdentity }).customer;
  }

  async logOut() {
    const response = await this.request('/logout', { method: 'POST' });
    if (!response.ok) return this.fail(response);
  }

  /** The signed-in customer's Service Appointments. The backend decides which Account to read. */
  async appointments(): Promise<Appointment[]> {
    const response = await this.request('/appointments');
    if (!response.ok) return this.fail(response);
    return ((await response.json()) as { appointments: AppointmentDto[] }).appointments.map(
      toAppointment,
    );
  }

  startActivation(email: string) {
    if (!validEmail(email.trim()))
      throw new ApiError('INVALID_EMAIL', 'Enter a valid email address.');
    return this.post<VerificationStarted>('/activation/start', { email: email.trim() });
  }

  startRegistration(details: RegistrationDetails) {
    return this.post<VerificationStarted>('/registration/start', details);
  }

  verifyCode(verificationId: string, code: string) {
    if (!/^\d{6}$/.test(code.trim()))
      throw new ApiError('INVALID_CODE', 'Enter the 6-digit code from the email.');
    return this.post<VerificationResult>('/otp/verify', { verificationId, code: code.trim() });
  }

  resendCode(verificationId: string) {
    return this.post<{ resendInSeconds: number }>('/otp/resend', { verificationId });
  }

  /** Sets the password and signs the customer in (the backend sets the session cookie). */
  async completeVerification(
    purpose: VerificationPurpose,
    verificationId: string,
    password: string,
    confirmPassword: string,
  ): Promise<DemoIdentity> {
    if (password.length < 12)
      throw new ApiError('INVALID_PASSWORD', 'Use a password with at least 12 characters.');
    if (password !== confirmPassword)
      throw new ApiError('PASSWORD_MISMATCH', 'The passwords do not match.');
    const path = purpose === 'activation' ? '/activation/complete' : '/registration/complete';
    return (
      await this.post<{ customer: DemoIdentity }>(path, {
        verificationId,
        password,
        confirmPassword,
      })
    ).customer;
  }
}
