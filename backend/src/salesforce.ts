import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import type { PendingAuthorization, SalesforceTokens, Session } from './session.js';

const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const SALESFORCE_HOST_SUFFIXES = ['.salesforce.com', '.force.com', '.salesforce.mil', '.cloudforce.com', '.sfcrmproducts.cn'];

/** Errors with a message that is safe to show the browser. Never carries token or secret material. */
export class SalesforceError extends Error {
  constructor(
    readonly code:
      | 'NOT_AUTHENTICATED'
      | 'REAUTH_REQUIRED'
      | 'OAUTH_FAILED'
      | 'SALESFORCE_UNAVAILABLE'
      | 'INTEGRATION_NOT_CONNECTED',
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function assertSalesforceUrl(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new SalesforceError('OAUTH_FAILED', `Salesforce did not return ${name}.`);
  const url = new URL(value);
  const trusted = url.protocol === 'https:' && SALESFORCE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  if (!trusted) throw new SalesforceError('OAUTH_FAILED', `Salesforce returned an unexpected ${name}.`);
  return value.replace(/\/$/, '');
}

// ---------- Authorization request ----------

export function beginAuthorization(session: Session): string {
  const pending: PendingAuthorization = {
    state: base64url(randomBytes(32)),
    codeVerifier: base64url(randomBytes(64)),
    createdAt: Date.now(),
  };
  session.pendingAuth = pending;

  const url = new URL('/services/oauth2/authorize', config.loginOrigin);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: config.scopes,
    state: pending.state,
    code_challenge: base64url(createHash('sha256').update(pending.codeVerifier).digest()),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/** Validates and consumes the one-time state. Returns the PKCE verifier bound to it. */
export function consumeState(session: Session, returnedState: unknown): string {
  const pending = session.pendingAuth;
  delete session.pendingAuth;
  if (!pending || typeof returnedState !== 'string' || !safeEqual(pending.state, returnedState))
    throw new SalesforceError('OAUTH_FAILED', 'The login request was invalid or did not start here. Please try again.', 400);
  if (Date.now() - pending.createdAt > PENDING_AUTH_TTL_MS)
    throw new SalesforceError('OAUTH_FAILED', 'The login request expired. Please try again.', 400);
  return pending.codeVerifier;
}

// ---------- Token endpoint ----------

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  instance_url?: string;
  id?: string;
  issued_at?: string;
  signature?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(params: Record<string, string>, action: string): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(new URL('/services/oauth2/token', config.loginOrigin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...params, client_id: config.clientId, client_secret: config.clientSecret }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SalesforceError('SALESFORCE_UNAVAILABLE', 'Could not reach the Salesforce token endpoint.');
  }
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || body.error) {
    // Salesforce's error/error_description never contain token material, so they are safe to log.
    console.warn(`[oauth] ${action} failed: HTTP ${response.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
    throw Object.assign(
      new SalesforceError('OAUTH_FAILED', `Salesforce rejected the ${action}: ${body.error_description ?? body.error ?? `HTTP ${response.status}`}`),
      { oauthError: body.error },
    );
  }
  return body;
}

/** Salesforce signs id + issued_at with the client secret; verifying it proves the response is genuine. */
function verifySignature(body: TokenResponse) {
  if (!body.id || !body.issued_at || !body.signature)
    throw new SalesforceError('OAUTH_FAILED', 'Salesforce returned an incomplete token response.');
  const expected = createHmac('sha256', config.clientSecret).update(body.id + body.issued_at).digest('base64');
  if (!safeEqual(expected, body.signature))
    throw new SalesforceError('OAUTH_FAILED', 'The Salesforce token response signature did not verify.');
}

function toTokens(body: TokenResponse, previous?: SalesforceTokens): SalesforceTokens {
  verifySignature(body);
  if (typeof body.access_token !== 'string' || !body.access_token)
    throw new SalesforceError('OAUTH_FAILED', 'Salesforce did not return an access token.');
  const refreshToken = body.refresh_token ?? previous?.refreshToken;
  const scope = body.scope ?? previous?.scope;
  return {
    accessToken: body.access_token,
    ...(refreshToken ? { refreshToken } : {}),
    ...(scope ? { scope } : {}),
    instanceUrl: assertSalesforceUrl('instance_url', body.instance_url ?? previous?.instanceUrl),
    identityUrl: assertSalesforceUrl('identity URL', body.id),
    issuedAt: Number(body.issued_at) || Date.now(),
  };
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<SalesforceTokens> {
  const body = await postToken(
    { grant_type: 'authorization_code', code, redirect_uri: config.callbackUrl, code_verifier: codeVerifier },
    'authorization code exchange',
  );
  return toTokens(body);
}

async function refresh(session: Session): Promise<void> {
  const current = session.salesforce;
  if (!current?.refreshToken) {
    delete session.salesforce;
    throw new SalesforceError('REAUTH_REQUIRED', 'The Salesforce session expired and no refresh token was issued. Log in again.', 401);
  }
  try {
    const body = await postToken({ grant_type: 'refresh_token', refresh_token: current.refreshToken }, 'token refresh');
    session.salesforce = toTokens(body, current);
    console.info('[oauth] access token refreshed');
  } catch (error) {
    if ((error as { oauthError?: string }).oauthError === 'invalid_grant') {
      delete session.salesforce;
      throw new SalesforceError('REAUTH_REQUIRED', 'The Salesforce refresh token is no longer valid. Log in again.', 401);
    }
    throw error;
  }
}

/** Concurrent requests that all hit 401 share a single refresh call. */
function refreshOnce(session: Session): Promise<void> {
  session.refreshing ??= refresh(session).finally(() => delete session.refreshing);
  return session.refreshing;
}

export async function revoke(tokens: SalesforceTokens) {
  const token = tokens.refreshToken ?? tokens.accessToken;
  await fetch(new URL('/services/oauth2/revoke', config.loginOrigin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => console.warn('[oauth] token revoke request failed'));
}

// ---------- Authenticated REST calls ----------

/**
 * GET a Salesforce resource with the session's access token.
 * `target` is either a path on the instance (e.g. `/services/data/`) or the trusted identity URL.
 * On 401 it refreshes once (if a refresh token exists) and retries.
 */
export function salesforceGet<T>(session: Session, target: (tokens: SalesforceTokens) => string): Promise<T> {
  return salesforceRequest<T>(session, target);
}

/**
 * Same as salesforceGet, for any method. Errors carry Salesforce's `errorCode` (e.g. DUPLICATES_DETECTED) as
 * `sfErrorCode`, and `unreachable: true` when no response arrived (a write may or may not have happened).
 */
export async function salesforceRequest<T>(
  session: Session,
  target: (tokens: SalesforceTokens) => string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  if (!session.salesforce)
    throw new SalesforceError('NOT_AUTHENTICATED', 'Not connected to Salesforce. Open /oauth/login first.', 401);

  for (let attempt = 0; ; attempt++) {
    const tokens = session.salesforce;
    if (!tokens) throw new SalesforceError('REAUTH_REQUIRED', 'Log in to Salesforce again.', 401);
    const path = target(tokens);
    const url = path.startsWith('https://') ? path : `${tokens.instanceUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw Object.assign(new SalesforceError('SALESFORCE_UNAVAILABLE', 'Could not reach Salesforce.'), {
        unreachable: true,
      });
    }
    if (response.status === 401 && attempt === 0) {
      await refreshOnce(session);
      continue;
    }
    if (response.status === 401) {
      delete session.salesforce;
      throw new SalesforceError('REAUTH_REQUIRED', 'Salesforce rejected the session. Log in again.', 401);
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as Array<{ errorCode?: string; message?: string }> | null;
      const first = Array.isArray(detail) ? detail[0] : undefined;
      console.warn(`[salesforce] ${method} ${new URL(url).pathname} -> HTTP ${response.status} ${first?.errorCode ?? ''}`);
      throw Object.assign(
        new SalesforceError('SALESFORCE_UNAVAILABLE', first?.message ?? `Salesforce returned HTTP ${response.status}.`),
        { sfErrorCode: first?.errorCode },
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
