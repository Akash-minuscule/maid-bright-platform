import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { db } from './appDb.js';
import { config } from './config.js';
import { SalesforceError, salesforceRequest } from './salesforce.js';
import type { SalesforceTokens, Session } from './session.js';

/**
 * The backend's own Salesforce connection, used for customer requests (sign-up, password setup, appointments).
 * It is created when a user listed in ADMIN_SF_USER_IDS logs in at /oauth/login. Customers never get
 * Salesforce tokens. The refresh token is stored encrypted when TOKEN_ENCRYPTION_KEY is set.
 */
const session: Session = { id: 'integration', lastSeen: Date.now() };
let connection: { sfUserId: string; orgId: string } | undefined;
let apiVersion: string | undefined;

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.tokenEncryptionKey!, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
}

function decrypt(stored: string): string {
  const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', config.tokenEncryptionKey!, iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}

/** Salesforce identity URLs end in /id/<orgId>/<userId>. */
export function identityIds(identityUrl: string): { orgId: string; userId: string } | undefined {
  const match = new URL(identityUrl).pathname.match(/\/id\/(00D[A-Za-z0-9]{12,15})\/(005[A-Za-z0-9]{12,15})$/);
  return match ? { orgId: match[1]!, userId: match[2]! } : undefined;
}

/** Called after an /oauth/login. Returns true when this login became the integration connection. */
export function connectIntegration(tokens: SalesforceTokens): boolean {
  const ids = identityIds(tokens.identityUrl);
  if (!ids || !config.adminSalesforceUserIds.includes(ids.userId.slice(0, 15))) return false;
  session.salesforce = { ...tokens };
  connection = { sfUserId: ids.userId, orgId: ids.orgId };
  apiVersion = undefined;
  db.prepare('DELETE FROM integration_connection').run();
  if (config.tokenEncryptionKey && tokens.refreshToken) {
    db.prepare(
      `INSERT INTO integration_connection (id, sf_user_id, org_id, instance_url, identity_url, scope, refresh_token_enc, connected_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(ids.userId, ids.orgId, tokens.instanceUrl, tokens.identityUrl, tokens.scope ?? null, encrypt(tokens.refreshToken), Date.now());
  }
  console.info(
    `[integration] connected as ${ids.userId}` +
      (config.tokenEncryptionKey && tokens.refreshToken ? ' (saved, encrypted)' : ' (memory only: lost on restart)'),
  );
  return true;
}

function loadSaved() {
  if (!config.tokenEncryptionKey) return;
  const row = db.prepare('SELECT * FROM integration_connection WHERE id = 1').get() as
    | { sf_user_id: string; org_id: string; instance_url: string; identity_url: string; scope: string | null; refresh_token_enc: string }
    | undefined;
  if (!row) return;
  if (!config.adminSalesforceUserIds.includes(row.sf_user_id.slice(0, 15))) {
    db.prepare('DELETE FROM integration_connection').run();
    return console.warn('[integration] saved connection belongs to a user no longer in ADMIN_SF_USER_IDS; removed');
  }
  let refreshToken: string;
  try {
    refreshToken = decrypt(row.refresh_token_enc);
  } catch {
    return console.warn('[integration] saved connection could not be decrypted (TOKEN_ENCRYPTION_KEY changed?); log in again');
  }
  // No access token yet: the first request gets a 401 and salesforceRequest refreshes it.
  session.salesforce = {
    accessToken: '',
    refreshToken,
    instanceUrl: row.instance_url,
    identityUrl: row.identity_url,
    issuedAt: 0,
    ...(row.scope ? { scope: row.scope } : {}),
  };
  connection = { sfUserId: row.sf_user_id, orgId: row.org_id };
  console.info(`[integration] restored saved connection for ${row.sf_user_id}`);
}
loadSaved();

function disconnect() {
  delete session.salesforce;
  connection = undefined;
  db.prepare('DELETE FROM integration_connection').run();
}

export const integrationStatus = () => connection;

/** True when revoking this refresh token would cut off the customer app. */
export const usesIntegrationToken = (tokens: SalesforceTokens) =>
  Boolean(tokens.refreshToken && tokens.refreshToken === session.salesforce?.refreshToken);

export function requireIntegration(): { sfUserId: string; orgId: string } {
  if (!connection || !session.salesforce)
    throw new SalesforceError('INTEGRATION_NOT_CONNECTED', 'Maid Bright is temporarily unavailable. Please try again later.', 503);
  return connection;
}

/** `/services/data/vNN.N` for the connected org. */
export async function dataPath(): Promise<string> {
  requireIntegration();
  apiVersion ??= (await call<Array<{ version: string }>>('/services/data/')).at(-1)?.version;
  if (!apiVersion) throw new SalesforceError('SALESFORCE_UNAVAILABLE', 'Salesforce returned no REST API versions.');
  return `/services/data/v${apiVersion}`;
}

async function call<T>(path: string, options: Parameters<typeof salesforceRequest>[2] = {}): Promise<T> {
  requireIntegration();
  try {
    return await salesforceRequest<T>(session, () => path, options);
  } catch (error) {
    if (error instanceof SalesforceError && error.code === 'REAUTH_REQUIRED') {
      console.error('[integration] Salesforce connection lost. An admin must log in at /oauth/login again.');
      disconnect();
      throw new SalesforceError('INTEGRATION_NOT_CONNECTED', 'Maid Bright is temporarily unavailable. Please try again later.', 503);
    }
    throw error;
  }
}

/** A Salesforce REST call as the integration user. `path` is relative to /services/data/vNN.N. */
export async function integrationRequest<T>(path: string, options: Parameters<typeof salesforceRequest>[2] = {}) {
  return call<T>(`${await dataPath()}${path}`, options);
}
