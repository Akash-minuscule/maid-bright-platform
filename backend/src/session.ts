import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/** Tokens live only in this server-side store. The browser holds an opaque, random session ID. */
export interface SalesforceTokens {
  accessToken: string;
  refreshToken?: string;
  instanceUrl: string;
  identityUrl: string;
  issuedAt: number;
  scope?: string;
}

export interface PendingAuthorization {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

export interface Session {
  id: string;
  lastSeen: number;
  pendingAuth?: PendingAuthorization;
  salesforce?: SalesforceTokens;
  refreshing?: Promise<void>;
}

declare global {
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

const COOKIE = 'mb_sid';
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();

function newSession(): Session {
  const session: Session = { id: randomBytes(32).toString('base64url'), lastSeen: Date.now() };
  sessions.set(session.id, session);
  return session;
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

function setCookie(res: Response, session: Session) {
  res.cookie(COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax', // Lax still sends the cookie on Salesforce's top-level redirect back to /oauth/callback.
    secure: config.secureCookies,
    path: '/',
    maxAge: IDLE_TIMEOUT_MS,
  });
}

export function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const id = readCookie(req, COOKIE);
  let session = id ? sessions.get(id) : undefined;
  if (session && now - session.lastSeen > IDLE_TIMEOUT_MS) {
    sessions.delete(session.id);
    session = undefined;
  }
  if (!session) {
    session = newSession();
    setCookie(res, session);
  }
  session.lastSeen = now;
  req.session = session;
  next();
}

/** Issue a fresh session ID after login so a pre-login ID can never be reused (session fixation). */
export function rotateSession(req: Request, res: Response): Session {
  sessions.delete(req.session.id);
  const next = newSession();
  setCookie(res, next);
  req.session = next;
  return next;
}

export function destroySession(req: Request, res: Response) {
  sessions.delete(req.session.id);
  res.clearCookie(COOKIE, { path: '/' });
}

setInterval(() => {
  const cutoff = Date.now() - IDLE_TIMEOUT_MS;
  for (const [id, session] of sessions) if (session.lastSeen < cutoff) sessions.delete(id);
}, 15 * 60 * 1000).unref();
