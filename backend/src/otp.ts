import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from './appDb.js';
import { config } from './config.js';
import { integrationRequest } from './integration.js';
import { SalesforceError } from './salesforce.js';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
const MAX_SENDS_PER_VERIFICATION = 5;
const MAX_SENDS_PER_EMAIL_PER_HOUR = 6;
/** How long a verified email stays usable for setting the password. */
export const VERIFIED_TTL_MS = 30 * 60 * 1000;
const CLAIM_TTL_MS = 2 * 60 * 1000;

export type Purpose = 'activation' | 'registration';

export interface Verification {
  id: string;
  purpose: Purpose;
  email: string;
  attempts: number;
  sends: number;
  lastSentAt: number;
  expiresAt: number;
  verifiedAt: number | null;
  outcome: string | null;
  contactJson: string | null;
  completedAt: number | null;
  createdAt: number;
}

// Codes are only 6 digits, so a plain hash would be trivial to reverse from a leaked database. A keyed HMAC is not.
// Without TOKEN_ENCRYPTION_KEY the key is per process, so outstanding codes stop working after a restart.
const codeKey = config.tokenEncryptionKey ?? randomBytes(32);
const hashCode = (id: string, code: string) => createHmac('sha256', codeKey).update(`${id}:${code}`).digest('base64url');

const COLUMNS = `id, purpose, email, attempts, sends, last_sent_at AS lastSentAt, expires_at AS expiresAt,
  verified_at AS verifiedAt, outcome, contact_json AS contactJson, completed_at AS completedAt, created_at AS createdAt`;

export const getVerification = (id: string) =>
  db.prepare(`SELECT ${COLUMNS} FROM email_verifications WHERE id = ?`).get(id) as Verification | undefined;

/** How many codes went to this email in the last hour, across all verifications. */
function recentSends(email: string, now: number) {
  const row = db
    .prepare('SELECT COALESCE(SUM(sends), 0) AS total FROM email_verifications WHERE email = ? AND created_at > ?')
    .get(email, now - 60 * 60 * 1000) as { total: number };
  return row.total;
}

export class OtpError extends Error {
  constructor(
    readonly code: 'TOO_MANY_CODES' | 'RESEND_TOO_SOON' | 'CODE_EXPIRED' | 'INVALID_CODE' | 'TOO_MANY_ATTEMPTS' | 'EMAIL_FAILED',
    message: string,
    readonly status: number,
    readonly extra: Record<string, number> = {},
  ) {
    super(message);
  }
}

async function sendCode(email: string, code: string, purpose: Purpose) {
  const subject = 'Your Maid Bright verification code';
  const action = purpose === 'activation' ? 'set your Maid Bright password' : 'create your Maid Bright account';
  const body =
    `Your Maid Bright verification code is ${code}.\n\n` +
    `Use it to ${action}. It expires in 10 minutes.\n\n` +
    `If you didn't ask for this, you can ignore this email.`;

  if (config.otpEmailProvider === 'console') {
    // Local development only (config refuses this provider on non-localhost). Never sent to the app.
    console.info(`[otp:console] code for ${email}: ${code}`);
    return;
  }
  try {
    const result = await integrationRequest<Array<{ isSuccess: boolean; errors?: Array<{ message?: string }> }>>(
      '/actions/standard/emailSimple',
      {
        method: 'POST',
        body: { inputs: [{ emailAddresses: email, emailSubject: subject, emailBody: body, senderType: 'CurrentUser' }] },
      },
    );
    if (!result[0]?.isSuccess) throw new Error(result[0]?.errors?.[0]?.message ?? 'emailSimple failed');
  } catch (error) {
    console.warn(`[otp] email send failed: ${(error as Error).message}`);
    if (error instanceof SalesforceError && error.code === 'INTEGRATION_NOT_CONNECTED') throw error;
    throw new OtpError('EMAIL_FAILED', "We couldn't send the code right now. Please try again in a few minutes.", 503);
  }
}

/** Always creates a verification and emails a code, whether or not the address is known. */
export async function startVerification(purpose: Purpose, email: string, contactJson: string | null, now = Date.now()) {
  if (recentSends(email, now) >= MAX_SENDS_PER_EMAIL_PER_HOUR)
    throw new OtpError('TOO_MANY_CODES', 'Too many codes were requested for this email. Try again in an hour.', 429);
  const id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await sendCode(email, code, purpose);
  db.prepare(
    `INSERT INTO email_verifications (id, purpose, email, code_hash, last_sent_at, expires_at, contact_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, purpose, email, hashCode(id, code), now, now + CODE_TTL_MS, contactJson, now);
  return id;
}

export async function resendCode(verification: Verification, now = Date.now()) {
  if (verification.verifiedAt || verification.completedAt || now - verification.createdAt > 60 * 60 * 1000)
    throw new OtpError('CODE_EXPIRED', 'This code request has expired. Please start again.', 410);
  const wait = verification.lastSentAt + RESEND_COOLDOWN_MS - now;
  if (wait > 0)
    throw new OtpError('RESEND_TOO_SOON', 'Please wait before asking for another code.', 429, {
      resendInSeconds: Math.ceil(wait / 1000),
    });
  if (verification.sends >= MAX_SENDS_PER_VERIFICATION || recentSends(verification.email, now) >= MAX_SENDS_PER_EMAIL_PER_HOUR)
    throw new OtpError('TOO_MANY_CODES', 'Too many codes were requested for this email. Try again in an hour.', 429);
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await sendCode(verification.email, code, verification.purpose);
  db.prepare(
    `UPDATE email_verifications SET code_hash = ?, attempts = 0, sends = sends + 1, last_sent_at = ?, expires_at = ?
     WHERE id = ?`,
  ).run(hashCode(verification.id, code), now, now + CODE_TTL_MS, verification.id);
}

/** Checks a code. Wrong codes count against the attempt limit; the right code does not mark anything yet. */
export function checkCode(verification: Verification, code: string, now = Date.now()) {
  if (verification.expiresAt <= now) throw new OtpError('CODE_EXPIRED', 'This code has expired. Ask for a new one.', 410);
  if (verification.attempts >= MAX_CODE_ATTEMPTS)
    throw new OtpError('TOO_MANY_ATTEMPTS', 'Too many incorrect codes. Ask for a new one.', 429);
  const stored = db.prepare('SELECT code_hash FROM email_verifications WHERE id = ?').get(verification.id) as { code_hash: string };
  const expected = Buffer.from(stored.code_hash);
  const actual = Buffer.from(hashCode(verification.id, code));
  if (/^\d{6}$/.test(code) && expected.length === actual.length && timingSafeEqual(expected, actual)) return;
  db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?').run(verification.id);
  const remaining = MAX_CODE_ATTEMPTS - verification.attempts - 1;
  if (remaining <= 0) throw new OtpError('TOO_MANY_ATTEMPTS', 'Too many incorrect codes. Ask for a new one.', 429);
  throw new OtpError('INVALID_CODE', 'That code is not correct.', 400, { attemptsRemaining: remaining });
}

export function markVerified(id: string, outcome: string, contactJson: string | null, now = Date.now()) {
  db.prepare('UPDATE email_verifications SET verified_at = ?, outcome = ?, contact_json = ? WHERE id = ?').run(
    now,
    outcome,
    contactJson,
    id,
  );
}

/** Takes the verification for one completion attempt. False when it is finished or another attempt is running. */
export function claim(id: string, now = Date.now()): boolean {
  const result = db
    .prepare(
      `UPDATE email_verifications SET claimed_at = ?
       WHERE id = ? AND completed_at IS NULL AND (claimed_at IS NULL OR claimed_at < ?)`,
    )
    .run(now, id, now - CLAIM_TTL_MS);
  return result.changes === 1;
}

export const release = (id: string) => db.prepare('UPDATE email_verifications SET claimed_at = NULL WHERE id = ?').run(id);
export const complete = (id: string, now = Date.now()) =>
  db.prepare('UPDATE email_verifications SET completed_at = ? WHERE id = ?').run(now, id);

setInterval(
  () => db.prepare('DELETE FROM email_verifications WHERE created_at < ?').run(Date.now() - 24 * 60 * 60 * 1000),
  60 * 60 * 1000,
).unref();
