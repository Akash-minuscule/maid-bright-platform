import { CustomerApi } from '../contracts';
import { ApiError } from '../errors';
import {
  Appointment,
  ChangeRequest,
  CustomerRequest,
  DemoOptions,
  Preferences,
  ProfileUpdate,
  Slot,
  Snapshot,
} from '../../types/domain';
import { atDay, createFixtures } from './fixtures';
import { DemoIdentity } from '../../types/auth';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const defaultDemoOptions: DemoOptions = {
  offline: false,
  requireReview: false,
  failNextPayment: false,
  conflictNextSlot: false,
};

/** An in-memory stand-in for the server. Policies and availability live here, never in screens. */
export class MockCustomerApi implements CustomerApi {
  private data: Snapshot = createFixtures();
  private authenticated = false;
  private epoch = 0;
  private sequence = 0;
  private activeIdentity?: DemoIdentity;
  private realAppointments?: Appointment[];
  private slots = new Map<string, Slot[]>();
  options: DemoOptions = { ...defaultDemoOptions };
  constructor(private delay = 300) {}
  setOptions(patch: Partial<DemoOptions>) {
    this.options = { ...this.options, ...patch };
  }
  private id(prefix: string) {
    return `${prefix}-${Date.now()}-${++this.sequence}`;
  }
  private async gate() {
    const epoch = this.epoch;
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    if (!this.authenticated || epoch !== this.epoch)
      throw new ApiError('SESSION_EXPIRED', 'Please open the demo again to continue.');
    if (this.options.offline)
      throw new ApiError('OFFLINE', 'You are offline. Reconnect before making changes.');
  }
  private notify(title: string, body: string, destination: 'requests' | 'payments' = 'requests') {
    this.data.notifications.unshift({
      id: this.id('ntf'),
      title,
      body,
      destination,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }
  /**
   * Backend mode: real Salesforce appointments replace the demo ones. Demo requests and notifications that
   * point at demo appointments are dropped so nothing links to a visit that does not exist.
   */
  setRealAppointments(appointments: Appointment[] | undefined) {
    this.realAppointments = appointments ? clone(appointments) : undefined;
    this.applyRealAppointments();
  }
  private applyRealAppointments() {
    if (!this.realAppointments) return;
    const ids = new Set(this.realAppointments.map((a) => a.id));
    this.data.appointments = clone(this.realAppointments);
    this.data.requests = this.data.requests.filter((r) => ids.has(r.appointmentId));
    this.data.notifications = this.data.notifications.filter(
      (n) => !n.appointmentId || ids.has(n.appointmentId),
    );
  }
  async signIn(identity?: DemoIdentity) {
    this.activeIdentity = identity ? clone(identity) : undefined;
    if (identity) {
      this.data = createFixtures();
      this.data.customer = { ...this.data.customer, ...identity };
    }
    this.applyRealAppointments();
    this.authenticated = true;
    return this.getSnapshot();
  }
  async signOut() {
    this.epoch++;
    this.authenticated = false;
    this.activeIdentity = undefined;
    this.realAppointments = undefined;
    this.data = createFixtures();
    this.slots.clear();
    this.options = { ...defaultDemoOptions };
  }
  async getSnapshot() {
    await this.gate();
    return clone(this.data);
  }
  async getAvailability(appointmentId: string) {
    await this.gate();
    const a = this.appointment(appointmentId);
    if (!a.actions.canReschedule)
      throw new ApiError('ACTION_UNAVAILABLE', 'This appointment cannot be rescheduled.');
    const slots = [3, 4, 5, 6, 7].flatMap((day) =>
      [14, 18].map((hour) => ({
        id: `${appointmentId}-slot-${day}-${hour}`,
        start: atDay(day, hour),
        end: atDay(day, hour + 2),
      })),
    );
    this.slots.set(appointmentId, slots);
    return clone(slots);
  }
  private appointment(id: string) {
    const a = this.data.appointments.find((item) => item.id === id);
    if (!a) throw new ApiError('NOT_FOUND', 'This appointment could not be found.', false);
    return a;
  }
  async submitChange(input: ChangeRequest) {
    await this.gate();
    const a = this.appointment(input.appointmentId);
    const permission = {
      reschedule: a.actions.canReschedule,
      skip: a.actions.canSkip,
      cancel: a.actions.canCancel,
      'add-service': a.actions.canAddService,
    }[input.kind];
    if (a.status !== 'Confirmed' || !permission)
      throw new ApiError(
        'ACTION_UNAVAILABLE',
        a.cancellationNotice || 'This visit has changed. Refresh the appointment and try again.',
      );
    if (this.data.requests.some((r) => r.appointmentId === a.id && r.status === 'Pending review'))
      throw new ApiError(
        'REQUEST_PENDING',
        'This appointment already has a request awaiting review.',
      );
    let slot: Slot | undefined;
    if (input.kind === 'reschedule') {
      slot = this.slots.get(a.id)?.find((s) => s.id === input.slotId);
      if (!slot)
        throw new ApiError('SLOT_UNAVAILABLE', 'Choose an available time before continuing.');
      if (this.options.conflictNextSlot) {
        this.options.conflictNextSlot = false;
        throw new ApiError(
          'SLOT_UNAVAILABLE',
          'That time is no longer available. Please choose another slot.',
        );
      }
    }
    const serviceIds = [...new Set(input.serviceIds ?? [])];
    if (
      input.kind === 'add-service' &&
      (!serviceIds.length ||
        serviceIds.some((id) => !this.data.services.some((s) => s.id === id)) ||
        serviceIds.some((id) => a.addons.includes(id)))
    )
      throw new ApiError(
        'INVALID_SERVICE',
        'Select at least one service that has not already been added.',
      );
    if (input.note.length > 1000)
      throw new ApiError('INVALID_NOTE', 'Please keep your note under 1,000 characters.');
    if (input.kind === 'cancel' && !input.note.trim())
      throw new ApiError('REASON_REQUIRED', 'Please add a reason for cancellation.');
    const review =
      this.options.requireReview || input.kind === 'cancel' || input.kind === 'add-service';
    const title = {
      reschedule: 'Reschedule',
      skip: 'Skip visit',
      cancel: 'Cancellation',
      'add-service': 'Additional services',
    }[input.kind];
    const request: CustomerRequest = {
      id: this.id('req'),
      appointmentId: a.id,
      kind: input.kind,
      title,
      note: input.note.trim(),
      status: review ? 'Pending review' : 'Approved',
      createdAt: new Date().toISOString(),
      slot,
      serviceIds,
    };
    if (!review) this.applyRequest(request);
    this.data.requests.unshift(request);
    this.notify(
      review ? `${title} request received` : `${title} confirmed`,
      review
        ? 'Your request is waiting for review by Maid Bright.'
        : 'Your appointment has been updated.',
    );
    return clone(this.data);
  }
  private applyRequest(request: CustomerRequest) {
    const a = this.appointment(request.appointmentId);
    if (a.status !== 'Confirmed')
      throw new ApiError(
        'APPOINTMENT_CHANGED',
        'This appointment is no longer available for changes.',
      );
    if (request.kind === 'reschedule' && request.slot) {
      a.scheduledStart = request.slot.start;
      a.scheduledEnd = request.slot.end;
    }
    if (request.kind === 'skip' || request.kind === 'cancel') {
      a.status = request.kind === 'skip' ? 'Skipped' : 'Cancelled';
      a.actions = { canReschedule: false, canSkip: false, canCancel: false, canAddService: false };
    }
    if (request.kind === 'add-service')
      a.addons = [...new Set([...a.addons, ...(request.serviceIds ?? [])])];
  }
  /** POC-only operation: stands in for a staff approval, not a customer API endpoint. */
  async resolveDemoRequest(id: string, approve: boolean) {
    await this.gate();
    const r = this.data.requests.find((item) => item.id === id);
    if (!r || r.status !== 'Pending review')
      throw new ApiError('REQUEST_CHANGED', 'This request is no longer pending.');
    if (approve) this.applyRequest(r);
    r.status = approve ? 'Approved' : 'Declined';
    this.notify(
      `${r.title} ${approve ? 'approved' : 'declined'}`,
      approve ? 'Your appointment has been updated.' : 'Your existing appointment has been kept.',
    );
    return clone(this.data);
  }
  async payInvoice(invoiceId: string) {
    await this.gate();
    const invoice = this.data.invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.status !== 'Due')
      throw new ApiError(
        'INVOICE_CHANGED',
        'This invoice has already been paid or is unavailable.',
      );
    if (this.options.failNextPayment) {
      this.options.failNextPayment = false;
      throw new ApiError(
        'PAYMENT_FAILED',
        'The demo payment did not go through. Please try again.',
      );
    }
    const payment = {
      id: this.id('pay'),
      invoiceId,
      amount: invoice.amount,
      paidAt: new Date().toISOString(),
      last4: this.data.savedMethod.last4,
      receiptNumber: `RCP-${this.id('demo')}`,
    };
    invoice.status = 'Paid';
    invoice.receiptId = payment.id;
    this.data.payments.unshift(payment);
    this.notify(
      'Demo payment complete',
      'Your receipt is ready. No money was charged.',
      'payments',
    );
    return clone(this.data);
  }
  async updateProfile(input: ProfileUpdate) {
    await this.gate();
    if (
      !input.firstName.trim() ||
      !input.lastName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
      input.phone.replace(/\D/g, '').length < 10 ||
      Object.values(input.address).some((v) => !v.trim())
    )
      throw new ApiError(
        'INVALID_PROFILE',
        'Please enter a name, valid email and phone, and complete service address.',
      );
    this.data.customer = { ...this.data.customer, ...clone(input) };
    for (const appointment of this.data.appointments)
      if (appointment.status === 'Confirmed') appointment.address = clone(input.address);
    return clone(this.data);
  }
  async updatePreferences(input: Preferences) {
    await this.gate();
    this.data.preferences = clone(input);
    return clone(this.data);
  }
  async sendMessage(body: string) {
    await this.gate();
    if (!body.trim() || body.trim().length > 1000)
      throw new ApiError(
        'INVALID_MESSAGE',
        'Please enter a message between 1 and 1,000 characters.',
      );
    this.data.messages.push({
      id: this.id('msg'),
      sender: 'customer',
      body: body.trim(),
      sentAt: new Date().toISOString(),
    });
    return clone(this.data);
  }
  async markNotificationRead(id: string) {
    await this.gate();
    const n = this.data.notifications.find((item) => item.id === id);
    if (n) n.read = true;
    return clone(this.data);
  }
  async resetDemo() {
    this.epoch++;
    this.data = createFixtures();
    if (this.activeIdentity) this.data.customer = { ...this.data.customer, ...this.activeIdentity };
    this.applyRealAppointments();
    this.slots.clear();
    this.options = { ...defaultDemoOptions };
    return this.getSnapshot();
  }
}
