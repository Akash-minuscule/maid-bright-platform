import { DemoIdentity, LoginInput, SignUpInput } from '../../types/auth';
import { ApiError } from '../errors';
export const demoCredentials = { email: 'alex.morgan@example.com', password: 'MaidBright123!' };
export const demoIdentity: DemoIdentity = {
  id: 'demo-customer',
  firstName: 'Alex',
  lastName: 'Morgan',
  email: demoCredentials.email,
  phone: '+1 (555) 010-2048',
};
type Digest = (input: string) => Promise<string>;
interface DemoAccount {
  identity: DemoIdentity;
  verifier: string;
  salt: string;
}
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
/** POC-only credentials in memory. This is not a production identity service. */
export class DemoAuthService {
  private accounts = new Map<string, DemoAccount>();
  private seedPromise?: Promise<void>;
  private sequence = 0;
  constructor(
    private digest: Digest,
    private delay = 250,
  ) {}
  private async ready() {
    this.seedPromise ??= this.digest(`maidbright-seed:${demoCredentials.password}`).then(
      (verifier) => {
        this.accounts.set(demoCredentials.email, {
          identity: { ...demoIdentity },
          salt: 'maidbright-seed',
          verifier,
        });
      },
    );
    await this.seedPromise;
    await new Promise((resolve) => setTimeout(resolve, this.delay));
  }
  async logIn(input: LoginInput): Promise<DemoIdentity> {
    const email = normalizeEmail(input.email);
    if (!validEmail(email) || !input.password)
      throw new ApiError('INVALID_LOGIN', 'Enter a valid email address and your password.');
    await this.ready();
    const account = this.accounts.get(email);
    if (!account || (await this.digest(`${account.salt}:${input.password}`)) !== account.verifier)
      throw new ApiError('INVALID_CREDENTIALS', 'Email or password does not match a demo account.');
    return { ...account.identity };
  }
  async signUp(input: SignUpInput): Promise<DemoIdentity> {
    const email = normalizeEmail(input.email);
    if (
      !input.firstName.trim() ||
      !input.lastName.trim() ||
      !validEmail(email) ||
      input.phone.replace(/\D/g, '').length < 10
    )
      throw new ApiError(
        'INVALID_SIGNUP',
        'Enter your first and last name, a valid email, and a phone number with at least 10 digits.',
      );
    if (input.password.length < 8 || input.password.length > 128)
      throw new ApiError('INVALID_PASSWORD', 'Use a sample password between 8 and 128 characters.');
    if (input.password !== input.confirmPassword)
      throw new ApiError('PASSWORD_MISMATCH', 'The passwords do not match.');
    await this.ready();
    const id = `demo-member-${Date.now()}-${++this.sequence}`;
    const salt = id;
    const verifier = await this.digest(`${salt}:${input.password}`);
    if (this.accounts.has(email))
      throw new ApiError('EMAIL_EXISTS', 'A demo account already uses this email. Log in instead.');
    const identity = {
      id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      email,
    };
    this.accounts.set(email, { identity, salt, verifier });
    return { ...identity };
  }
}
