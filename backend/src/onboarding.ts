import express, { type Request, type Response } from 'express';
import { customers } from './appDb.js';
import { scheduleUserProvisioning } from './customerUsers.js';
import { publicCustomer, setSessionCookie, validEmail } from './customerAuth.js';
import { CustomerStoreError, normalizeEmail } from './customerStore.js';
import { requireIntegration } from './integration.js';
import {
  CODE_TTL_MS,
  OtpError,
  RESEND_COOLDOWN_MS,
  VERIFIED_TTL_MS,
  checkCode,
  claim,
  complete,
  getVerification,
  markVerified,
  release,
  resendCode,
  startVerification,
  type Purpose,
  type Verification,
} from './otp.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hashPassword } from './passwords.js';
import {
  RegistrationError,
  createAccountAndContact,
  findContactCreatedSince,
  findContactsByEmail,
  isSalesforceDown,
  type ContactMatch,
  type NewCustomerDetails,
} from './salesforceCustomers.js';

/**
 * Email-verified onboarding, mounted under /api/customer after customerRouter (which applies CORS, the
 * cross-site check and JSON parsing).
 *
 * Enumeration rule: the "start" calls always answer the same way and always send a code. Whether the email
 * matches a Salesforce Contact or an existing login is decided and revealed only after the code is verified.
 */
export const onboardingRouter = express.Router();

const fail = (res: Response, status: number, error: string, message: string, extra: object = {}) =>
  res.status(status).json({ error, message, ...extra });

// ---------- Per-IP limit on code requests (in memory) ----------
const ipStarts = new Map<string, { count: number; since: number }>();
function ipLimited(req: Request) {
  const now = Date.now();
  const key = req.ip ?? 'unknown';
  const entry = ipStarts.get(key);
  if (!entry || now - entry.since > 60 * 60 * 1000) {
    ipStarts.set(key, { count: 1, since: now });
    return false;
  }
  entry.count++;
  return entry.count > 30;
}

const text = (body: unknown, key: string) => {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value : '';
};

function started(res: Response, verificationId: string) {
  res.status(202).json({
    verificationId,
    message: 'If this email can be used, we sent a 6-digit code to it.',
    expiresInSeconds: CODE_TTL_MS / 1000,
    resendInSeconds: RESEND_COOLDOWN_MS / 1000,
  });
}

function otpFailure(res: Response, error: unknown) {
  if (error instanceof OtpError) return fail(res, error.status, error.code, error.message, error.extra);
  throw error;
}

// ---------- Start ----------

onboardingRouter.post('/activation/start', async (req, res) => {
  const email = normalizeEmail(text(req.body, 'email'));
  if (!validEmail(email)) return fail(res, 400, 'INVALID_EMAIL', 'Enter a valid email address.');
  if (ipLimited(req)) return fail(res, 429, 'TOO_MANY_CODES', 'Too many requests. Try again later.');
  requireIntegration(); // fail fast (503) for everyone when Salesforce is not connected
  try {
    started(res, await startVerification('activation', email, null));
  } catch (error) {
    otpFailure(res, error);
  }
});

function readDetails(body: unknown): NewCustomerDetails | string {
  const firstName = text(body, 'firstName').trim();
  const lastName = text(body, 'lastName').trim();
  const email = normalizeEmail(text(body, 'email'));
  const phone = text(body, 'phone').trim();
  if (!firstName || !lastName || firstName.length > 40 || lastName.length > 80)
    return 'Enter your first and last name.';
  if (!validEmail(email)) return 'Enter a valid email address.';
  if (phone.replace(/\D/g, '').length < 10 || phone.length > 40) return 'Enter a phone number with at least 10 digits.';
  return { firstName, lastName, email, phone };
}

onboardingRouter.post('/registration/start', async (req, res) => {
  const details = readDetails(req.body);
  if (typeof details === 'string') return fail(res, 400, 'INVALID_DETAILS', details);
  if (ipLimited(req)) return fail(res, 429, 'TOO_MANY_CODES', 'Too many requests. Try again later.');
  requireIntegration();
  try {
    started(res, await startVerification('registration', details.email, JSON.stringify(details)));
  } catch (error) {
    otpFailure(res, error);
  }
});

onboardingRouter.post('/otp/resend', async (req, res) => {
  const verification = getVerification(text(req.body, 'verificationId'));
  if (!verification) return fail(res, 410, 'CODE_EXPIRED', 'This code request has expired. Please start again.');
  try {
    await resendCode(verification);
    res.json({ message: 'We sent a new code.', expiresInSeconds: CODE_TTL_MS / 1000, resendInSeconds: RESEND_COOLDOWN_MS / 1000 });
  } catch (error) {
    otpFailure(res, error);
  }
});

// ---------- Verify ----------

/** Runs only after the code is correct: decides what this verified email can do. */
async function decideOutcome(v: Verification): Promise<{ outcome: string; contactJson: string | null }> {
  if (customers.findForLogin(v.email))
    return { outcome: v.purpose === 'activation' ? 'ALREADY_ACTIVATED' : 'ALREADY_REGISTERED', contactJson: v.contactJson };
  const contacts = await findContactsByEmail(v.email);
  if (v.purpose === 'registration')
    return { outcome: contacts.length ? 'EXISTING_CUSTOMER' : 'READY', contactJson: v.contactJson };
  const withAccount = contacts.filter((c) => c.AccountId);
  if (contacts.length > 1) return { outcome: 'MULTIPLE_MATCHES', contactJson: null };
  if (withAccount.length !== 1) return { outcome: 'NO_MATCH', contactJson: null };
  return { outcome: 'READY', contactJson: JSON.stringify(withAccount[0]) };
}

const OUTCOME_MESSAGES: Record<string, string> = {
  READY: 'Email verified. Now create your password.',
  ALREADY_ACTIVATED: 'You already have a Maid Bright password. Sign in instead.',
  ALREADY_REGISTERED: 'You already have a Maid Bright account. Sign in instead.',
  NO_MATCH:
    "We couldn't find a Maid Bright customer record for this email. Check the email, or create a new customer account.",
  MULTIPLE_MATCHES:
    'This email is linked to more than one customer record, so we can’t set up your login automatically. Please contact Maid Bright.',
  EXISTING_CUSTOMER:
    'This email already belongs to a Maid Bright customer. Use “Existing customer? Activate your account” instead.',
};

function outcomeResponse(v: Verification, outcome: string, contactJson: string | null) {
  // activation stores the Salesforce Contact (FirstName); registration stores the entered details (firstName)
  const parsed = contactJson ? (JSON.parse(contactJson) as { FirstName?: string | null; firstName?: string }) : undefined;
  const firstName = outcome === 'READY' ? (parsed?.FirstName ?? parsed?.firstName) : undefined;
  return { purpose: v.purpose, status: outcome, message: OUTCOME_MESSAGES[outcome], ...(firstName ? { firstName } : {}) };
}

onboardingRouter.post('/otp/verify', async (req, res) => {
  const verification = getVerification(text(req.body, 'verificationId'));
  if (!verification) return fail(res, 410, 'CODE_EXPIRED', 'This code request has expired. Please start again.');
  if (verification.verifiedAt && verification.outcome)
    return res.json(outcomeResponse(verification, verification.outcome, verification.contactJson)); // repeat submit
  try {
    checkCode(verification, text(req.body, 'code').trim());
  } catch (error) {
    return otpFailure(res, error);
  }
  // A Salesforce failure here leaves the code unused, so the customer can simply press Verify again.
  const { outcome, contactJson } = await decideOutcome(verification);
  markVerified(verification.id, outcome, contactJson);
  res.json(outcomeResponse(verification, outcome, contactJson));
});

// ---------- Complete ----------

function readPassword(req: Request): string | { error: string } {
  const password = text(req.body, 'password');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
    return { error: `Use a password with ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.` };
  if (password !== text(req.body, 'confirmPassword')) return { error: 'The passwords do not match.' };
  return password;
}

function readyVerification(res: Response, id: string, purpose: Purpose): Verification | undefined {
  const v = getVerification(id);
  const now = Date.now();
  if (!v || v.purpose !== purpose || !v.verifiedAt || now - v.verifiedAt > VERIFIED_TTL_MS || v.completedAt) {
    fail(res, 410, 'VERIFICATION_EXPIRED', 'Your email verification has expired. Please start again.');
    return undefined;
  }
  if (v.outcome !== 'READY') {
    fail(res, 409, v.outcome ?? 'NOT_READY', OUTCOME_MESSAGES[v.outcome ?? ''] ?? 'This email cannot be used here.');
    return undefined;
  }
  if (!claim(v.id)) {
    fail(res, 409, 'ALREADY_IN_PROGRESS', 'This request is already being processed.');
    return undefined;
  }
  return v;
}

function finish(res: Response, v: Verification, customerId: string) {
  complete(v.id);
  setSessionCookie(res, customers.createSession(customerId));
  const account = customers.findForLogin(v.email)!;
  res.status(201).json({ customer: publicCustomer(account.customer) });
  // After the response: the customer is already signed in, whatever happens to Salesforce User provisioning.
  scheduleUserProvisioning(customerId);
}

onboardingRouter.post('/activation/complete', async (req, res) => {
  const password = readPassword(req);
  if (typeof password !== 'string') return fail(res, 400, 'INVALID_PASSWORD', password.error);
  const v = readyVerification(res, text(req.body, 'verificationId'), 'activation');
  if (!v) return;
  try {
    const stored = JSON.parse(v.contactJson!) as ContactMatch;
    // Salesforce may have changed since the code was verified: insist on the same single match.
    const now = (await findContactsByEmail(v.email)).filter((c) => c.AccountId);
    if (now.length !== 1 || now[0]!.Id !== stored.Id || now[0]!.AccountId !== stored.AccountId) {
      release(v.id);
      return fail(res, 409, 'RECORD_CHANGED', 'Your customer record changed. Please start again or contact Maid Bright.');
    }
    const contact = now[0]!;
    const { orgId, sfUserId } = requireIntegration();
    const customer = customers.create({
      email: v.email,
      passwordHash: await hashPassword(password),
      firstName: contact.FirstName ?? '',
      lastName: contact.LastName,
      phone: contact.Phone ?? '',
      salesforce: { orgId, contactId: contact.Id, accountId: contact.AccountId! },
      verifiedBySfUserId: sfUserId,
    });
    console.info(`[onboarding] activated ${customer.id} -> Contact ${contact.Id}`);
    finish(res, v, customer.id);
  } catch (error) {
    release(v.id);
    if (error instanceof CustomerStoreError) return fail(res, 409, error.code, error.message);
    throw error;
  }
});

// One registration per email at a time inside this process, so two tabs cannot both create Salesforce records.
const registering = new Set<string>();

onboardingRouter.post('/registration/complete', async (req, res) => {
  const password = readPassword(req);
  if (typeof password !== 'string') return fail(res, 400, 'INVALID_PASSWORD', password.error);
  const v = readyVerification(res, text(req.body, 'verificationId'), 'registration');
  if (!v) return;
  if (registering.has(v.email)) {
    release(v.id);
    return fail(res, 409, 'ALREADY_IN_PROGRESS', 'This request is already being processed.');
  }
  registering.add(v.email);
  const startedAt = new Date(Date.now() - 60 * 1000);
  try {
    const details = JSON.parse(v.contactJson!) as NewCustomerDetails;
    if (customers.findForLogin(v.email)) {
      release(v.id);
      return fail(res, 409, 'ALREADY_REGISTERED', OUTCOME_MESSAGES.ALREADY_REGISTERED!);
    }
    if ((await findContactsByEmail(v.email)).length) {
      release(v.id);
      return fail(res, 409, 'EXISTING_CUSTOMER', OUTCOME_MESSAGES.EXISTING_CUSTOMER!);
    }

    let ids: { accountId: string; contactId: string };
    try {
      ids = await createAccountAndContact(details);
    } catch (error) {
      // No response: the records may exist. Adopt them rather than risk creating a second pair on retry.
      const created = isSalesforceDown(error) ? await findContactCreatedSince(v.email, startedAt).catch(() => undefined) : undefined;
      if (!created) throw error;
      ids = { accountId: created.AccountId!, contactId: created.Id };
    }

    const { orgId, sfUserId } = requireIntegration();
    try {
      const customer = customers.create({
        email: v.email,
        passwordHash: await hashPassword(password),
        firstName: details.firstName,
        lastName: details.lastName,
        phone: details.phone,
        salesforce: { orgId, ...ids },
        verifiedBySfUserId: sfUserId,
      });
      console.info(`[onboarding] registered ${customer.id} -> Account ${ids.accountId}, Contact ${ids.contactId}`);
      finish(res, v, customer.id);
    } catch (error) {
      console.error(`[onboarding] Salesforce records created but local login failed: Account ${ids.accountId}, Contact ${ids.contactId}`);
      throw error;
    }
  } catch (error) {
    release(v.id);
    if (error instanceof RegistrationError)
      return fail(
        res,
        error.code === 'DUPLICATE_RECORD' ? 409 : 502,
        error.code,
        error.code === 'DUPLICATE_RECORD'
          ? 'We may already have a record for you. Please contact Maid Bright to finish setting up your account.'
          : "We couldn't create your account right now. Please try again.",
      );
    if (error instanceof CustomerStoreError) return fail(res, 409, error.code, error.message);
    throw error;
  } finally {
    registering.delete(v.email);
  }
});
