import express, { type NextFunction, type Request, type Response } from 'express';
import { customers } from './appDb.js';
import { config } from './config.js';
import { SESSION_MAX_AGE_MS, normalizeEmail, type Customer, type CustomerSession } from './customerStore.js';
import { requireIntegration } from './integration.js';
import { PASSWORD_MAX_LENGTH, getDummyHash, verifyPassword } from './passwords.js';
import { listAppointments } from './salesforceCustomers.js';
import { readCookie } from './session.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireCustomer. Holds the customer and their server-verified Salesforce link. */
      customer?: CustomerSession;
    }
  }
}

setInterval(() => customers.purgeExpiredSessions(), 15 * 60 * 1000).unref();

const COOKIE = 'mb_customer';
export const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/** Only what the app needs to show. No password hash, and no Salesforce IDs. */
export const publicCustomer = ({ id, email, firstName, lastName, phone }: Customer) => ({ id, email, firstName, lastName, phone });

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS, // the server enforces the shorter idle timeout itself
  });
}

const fail = (res: Response, status: number, error: string, message: string) => res.status(status).json({ error, message });

// ---------- Brute-force protection (in memory; resets on restart) ----------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;
const failures = new Map<string, { count: number; since: number }>();

function failureCount(key: string, now: number) {
  const entry = failures.get(key);
  if (entry && now - entry.since > WINDOW_MS) failures.delete(key);
  return failures.get(key)?.count ?? 0;
}
function recordFailure(key: string, now: number) {
  const entry = failures.get(key);
  failures.set(key, entry && now - entry.since <= WINDOW_MS ? { ...entry, count: entry.count + 1 } : { count: 1, since: now });
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) if (now - entry.since > WINDOW_MS) failures.delete(key);
}, WINDOW_MS).unref();

// ---------- Middleware ----------

/** CORS for the web app: only listed origins may call with cookies. */
function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && config.frontendOrigins.includes(origin)) {
    res.vary('Origin');
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Max-Age', '600');
      return res.sendStatus(204);
    }
  }
  next();
}

/** CSRF defence: browsers always send Origin on POST, so a foreign Origin means a cross-site request. */
function sameOriginWrites(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (req.method === 'POST' && origin && origin !== config.publicOrigin && !config.frontendOrigins.includes(origin))
    return fail(res, 403, 'FORBIDDEN_ORIGIN', 'This request was not sent by the Maid Bright app.');
  next();
}

/** Protects customer routes. Never trusts customer or Salesforce IDs from the request; they come from the session. */
export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  const session = token ? customers.getSession(token) : undefined;
  if (!session) return fail(res, 401, 'NOT_SIGNED_IN', 'Please log in to continue.');
  req.customer = session;
  next();
}

// ---------- Routes: /api/customer ----------

export const customerRouter = express.Router();
customerRouter.use(cors, sameOriginWrites, express.json({ limit: '10kb' }));

customerRouter.post('/login', async (req, res) => {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!validEmail(email) || !password || password.length > PASSWORD_MAX_LENGTH)
    return fail(res, 400, 'INVALID_LOGIN', 'Enter a valid email address and your password.');

  const now = Date.now();
  const emailKey = `email:${email}`;
  const ipKey = `ip:${req.ip}`;
  if (failureCount(emailKey, now) >= MAX_FAILURES_PER_EMAIL || failureCount(ipKey, now) >= MAX_FAILURES_PER_IP)
    return fail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Wait 15 minutes and try again.');

  const account = customers.findForLogin(email);
  const passwordOk = await verifyPassword(password, account?.passwordHash ?? (await getDummyHash()));
  if (!account || !passwordOk || account.customer.status !== 'active') {
    recordFailure(emailKey, now);
    recordFailure(ipKey, now);
    console.warn(`[customer] failed login (${failureCount(emailKey, now)} recent for this email)`);
    // Same answer whether the email is unknown, not yet activated or the password is wrong (no enumeration).
    return fail(
      res,
      401,
      'INVALID_CREDENTIALS',
      'Email or password is incorrect. Signing in for the first time? Choose “Existing customer? Activate your account”.',
    );
  }

  failures.delete(emailKey);
  const previous = readCookie(req, COOKIE);
  if (previous) customers.deleteSession(previous); // never carry a pre-login session forward
  setSessionCookie(res, customers.createSession(account.customer.id));
  console.info(`[customer] login ${account.customer.id}`);
  res.json({ customer: publicCustomer(account.customer) });
});

customerRouter.get('/me', requireCustomer, (req, res) => {
  res.json({ customer: publicCustomer(req.customer!.customer) });
});

/** The signed-in customer's appointments. The Account comes from the session, never from the request. */
customerRouter.get('/appointments', requireCustomer, async (req, res) => {
  const { salesforce } = req.customer!;
  if (requireIntegration().orgId.slice(0, 15) !== salesforce.orgId.slice(0, 15))
    return fail(res, 409, 'ORG_MISMATCH', 'Your account is linked to a different Salesforce org. Please contact Maid Bright.');
  res.json({ appointments: await listAppointments(salesforce.accountId) });
});

customerRouter.post('/logout', (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) customers.deleteSession(token);
  res.clearCookie(COOKIE, { path: '/' });
  res.status(204).end();
});

customerRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if ((err as { type?: string })?.type === 'entity.parse.failed')
    return fail(res, 400, 'INVALID_REQUEST', 'The request body must be valid JSON.');
  next(err);
});
