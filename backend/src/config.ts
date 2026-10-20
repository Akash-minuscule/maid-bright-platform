import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

export class ConfigError extends Error {}

const PLACEHOLDERS = new Set(['your_consumer_key', 'your_consumer_secret']);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is missing. Set it in backend/.env.`);
  if (PLACEHOLDERS.has(value))
    throw new ConfigError(`${name} still has its placeholder value. Set it in backend/.env.`);
  return value;
}

function parseUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ConfigError(`${name} is not a valid URL: ${value}`);
  }
}

function list(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name]?.trim();
  return raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function loadConfig() {
  const clientId = required('SF_CLIENT_ID');
  const clientSecret = required('SF_CLIENT_SECRET');
  const callbackRaw = required('SF_CALLBACK_URL');
  const callbackUrl = parseUrl('SF_CALLBACK_URL', callbackRaw);
  const loginUrl = parseUrl('SF_LOGIN_URL', required('SF_LOGIN_URL'));

  if (loginUrl.protocol !== 'https:') throw new ConfigError('SF_LOGIN_URL must use https.');
  if (callbackUrl.pathname !== '/oauth/callback')
    throw new ConfigError('SF_CALLBACK_URL must end with /oauth/callback (the route this server handles).');
  const isLocal = ['localhost', '127.0.0.1'].includes(callbackUrl.hostname);
  if (callbackUrl.protocol !== 'https:' && !isLocal)
    throw new ConfigError('SF_CALLBACK_URL must use https unless it points at localhost.');

  const port = Number(process.env.PORT ?? (callbackUrl.port || (callbackUrl.protocol === 'https:' ? 443 : 80)));

  const frontendOrigins = list('FRONTEND_ORIGINS', ['http://localhost:8081']).map((value) => {
    const origin = parseUrl('FRONTEND_ORIGINS', value).origin;
    if (origin !== value.replace(/\/$/, ''))
      throw new ConfigError(`FRONTEND_ORIGINS entries must be bare origins like http://localhost:8081, got ${value}`);
    return origin;
  });
  const adminSalesforceUserIds = list('ADMIN_SF_USER_IDS').map((id) => {
    if (!/^005[A-Za-z0-9]{12}([A-Za-z0-9]{3})?$/.test(id))
      throw new ConfigError(`ADMIN_SF_USER_IDS must contain Salesforce User IDs (005...), got ${id}`);
    return id.slice(0, 15);
  });

  const keyRaw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const tokenEncryptionKey = keyRaw ? Buffer.from(keyRaw, 'base64') : undefined;
  if (tokenEncryptionKey && tokenEncryptionKey.length !== 32)
    throw new ConfigError('TOKEN_ENCRYPTION_KEY must be 32 random bytes in base64 (see backend/.env.example).');

  const otpEmailProvider = process.env.OTP_EMAIL_PROVIDER?.trim() || 'console';
  if (otpEmailProvider !== 'console' && otpEmailProvider !== 'salesforce')
    throw new ConfigError('OTP_EMAIL_PROVIDER must be "console" or "salesforce".');
  if (otpEmailProvider === 'console' && !isLocal)
    throw new ConfigError('OTP_EMAIL_PROVIDER=console prints codes to the server log and is only allowed on localhost.');

  return {
    clientId,
    clientSecret,
    /** Sent to Salesforce byte-for-byte; must match the app's configured callback exactly. */
    callbackUrl: callbackRaw,
    loginOrigin: loginUrl.origin,
    port,
    secureCookies: callbackUrl.protocol === 'https:',
    scopes: 'api refresh_token',
    /** This server's own origin, e.g. http://localhost:8000. */
    publicOrigin: callbackUrl.origin,
    /** Web app origins allowed to call /api/customer with cookies (CORS). */
    frontendOrigins,
    /**
     * 15-character Salesforce User IDs whose /oauth/login becomes the backend's server-wide Salesforce connection
     * (used for customer sign-up, password setup and appointments). Empty = no integration connection.
     */
    adminSalesforceUserIds,
    /** AES-256-GCM key for storing the integration refresh token. Without it the connection is kept in memory only. */
    tokenEncryptionKey,
    /** 'console' (localhost only: codes are printed in the backend terminal) or 'salesforce' (emailSimple action). */
    otpEmailProvider: otpEmailProvider as 'console' | 'salesforce',
    dbPath: process.env.MB_DB_PATH?.trim() || resolve(import.meta.dirname, '../data/maidbright.db'),
  } as const;
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const config: AppConfig = loadConfig();
