const mode = process.env.EXPO_PUBLIC_API_MODE ?? 'demo';

export const environment = {
  /** 'demo' = everything in memory. 'backend' = customer login through the Maid Bright backend. */
  mode,
  usesBackendLogin: mode === 'backend',
  /** The Maid Bright backend. Holds every secret and token; the app only ever gets an HttpOnly cookie. */
  backendUrl: (process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  salesforceLoginDomain: process.env.EXPO_PUBLIC_SF_LOGIN_DOMAIN ?? '',
  salesforceConsumerKey: process.env.EXPO_PUBLIC_SF_CONSUMER_KEY ?? '',
  salesforceCallbackUrl: process.env.EXPO_PUBLIC_SF_CALLBACK_URL ?? 'maidbright://oauth/callback',
  apiBasePath: '/services/apexrest/maidbright/v1',
} as const;
