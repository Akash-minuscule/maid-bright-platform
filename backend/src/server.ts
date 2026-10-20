import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { customerRouter } from './customerAuth.js';
import { connectIntegration, integrationStatus, usesIntegrationToken } from './integration.js';
import { onboardingRouter } from './onboarding.js';
import { escapeHtml, page } from './html.js';
import { destroySession, rotateSession, sessionMiddleware } from './session.js';
import { SalesforceError, beginAuthorization, consumeState, exchangeCode, revoke, salesforceGet } from './salesforce.js';

const app = express();
app.disable('x-powered-by');
app.use(sessionMiddleware);
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer'); // keeps ?code= out of Referer headers
  next();
});

app.use('/api/customer', customerRouter, onboardingRouter);

app.get('/', (req, res) => {
  const connected = Boolean(req.session.salesforce);
  const integration = integrationStatus();
  const appStatus = integration
    ? `<p>Customer app connection: <strong>connected</strong> as Salesforce user <code>${escapeHtml(integration.sfUserId)}</code>.</p>`
    : `<p>Customer app connection: <strong>not connected</strong>. Log in with a Salesforce user listed in ADMIN_SF_USER_IDS.</p>`;
  page(
    res,
    200,
    'Maid Bright backend',
    appStatus +
    (connected
      ? `<p>Connected to Salesforce.</p><p><a href="/api/salesforce/health">Check /api/salesforce/health</a></p>` +
          `<form method="post" action="/oauth/logout"><button>Log out of Salesforce</button></form>`
      : `<p>Not connected.</p><p><a href="/oauth/login">Log in with Salesforce</a></p>`),
  );
});

app.get('/oauth/login', (req, res) => {
  const authorizeUrl = new URL(beginAuthorization(req.session));
  console.info(`[oauth] authorize -> ${authorizeUrl.origin}${authorizeUrl.pathname} redirect_uri=${authorizeUrl.searchParams.get('redirect_uri')}`);
  res.redirect(302, authorizeUrl.toString());
});

/** Dev diagnostic: shows the non-secret parts of the authorize request /oauth/login would send. Starts no login. */
app.get('/oauth/debug', (_req, res) => {
  const authorizeUrl = new URL(beginAuthorization({ id: 'diagnostic', lastSeen: Date.now() }));
  const p = authorizeUrl.searchParams;
  const clientId = p.get('client_id') ?? '';
  res.json({
    authorizeEndpoint: `${authorizeUrl.origin}${authorizeUrl.pathname}`,
    redirect_uri: p.get('redirect_uri'),
    tokenExchangeRedirectUri: config.callbackUrl,
    response_type: p.get('response_type'),
    scope: p.get('scope'),
    code_challenge_method: p.get('code_challenge_method'),
    client_id: `${clientId.slice(0, 6)}…${clientId.slice(-4)} (${clientId.length} chars)`,
    backendListeningPort: config.port,
    note: 'Salesforce must list redirect_uri exactly in the External Client App Callback URL setting.',
  });
});

app.get('/oauth/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  const retry = `<p><a href="/oauth/login">Try again</a></p>`;

  if (typeof error === 'string') {
    delete req.session.pendingAuth;
    console.warn(`[oauth] authorization denied by Salesforce: ${error}`);
    const detail = typeof errorDescription === 'string' ? errorDescription : error;
    return page(res, 400, 'Salesforce login failed', `<p>${escapeHtml(detail)}</p>${retry}`);
  }

  let codeVerifier: string;
  try {
    codeVerifier = consumeState(req.session, state);
  } catch (err) {
    return page(res, 400, 'Salesforce login failed', `<p>${escapeHtml((err as Error).message)}</p>${retry}`);
  }
  if (typeof code !== 'string' || !code)
    return page(res, 400, 'Salesforce login failed', `<p>Salesforce did not return an authorization code.</p>${retry}`);

  try {
    const tokens = await exchangeCode(code, codeVerifier);
    rotateSession(req, res).salesforce = tokens;
    connectIntegration(tokens); // only when this user is listed in ADMIN_SF_USER_IDS
    console.info(`[oauth] connected to ${tokens.instanceUrl} (refresh token ${tokens.refreshToken ? 'issued' : 'not issued'})`);
    res.redirect(303, '/');
  } catch (err) {
    const message = err instanceof SalesforceError ? err.message : 'Unexpected error while completing login.';
    if (!(err instanceof SalesforceError)) console.error('[oauth] callback error', (err as Error).message);
    page(res, 502, 'Salesforce login failed', `<p>${escapeHtml(message)}</p>${retry}`);
  }
});

app.post('/oauth/logout', async (req, res) => {
  const tokens = req.session.salesforce;
  destroySession(req, res);
  // Revoking would also cut off the customer app when this login is its integration connection.
  if (tokens && !usesIntegrationToken(tokens)) await revoke(tokens);
  res.redirect(303, '/');
});

interface Identity {
  user_id: string;
  organization_id: string;
  username: string;
  display_name: string;
}

/** The logged-in Salesforce user, read live from the identity URL. Returns only non-secret fields. */
app.get('/api/salesforce/identity', async (req, res) => {
  const identity = await salesforceGet<Identity>(req.session, (t) => t.identityUrl);
  res.json({
    userId: identity.user_id,
    orgId: identity.organization_id,
    username: identity.username,
  });
});

app.get('/api/salesforce/health', async (req, res) => {
  const tokens = req.session.salesforce;
  if (!tokens) {
    return res.json({ configured: true, authenticated: false, loginUrl: '/oauth/login' });
  }
  const identity = await salesforceGet<Identity>(req.session, (t) => t.identityUrl);
  const versions = await salesforceGet<Array<{ version: string }>>(req.session, () => '/services/data/');
  const apiVersion = versions.at(-1)?.version;
  if (!apiVersion) throw new SalesforceError('SALESFORCE_UNAVAILABLE', 'Salesforce returned no REST API versions.');
  const soql = encodeURIComponent(`SELECT Id, Name, Username FROM User WHERE Id = '${identity.user_id.replace(/[^A-Za-z0-9]/g, '')}'`);
  const users = await salesforceGet<{ records: Array<{ Id: string; Name: string; Username: string }> }>(
    req.session,
    () => `/services/data/v${apiVersion}/query?q=${soql}`,
  );

  res.json({
    configured: true,
    authenticated: true,
    salesforce: {
      instanceUrl: req.session.salesforce?.instanceUrl,
      apiVersion,
      orgId: identity.organization_id,
      userId: identity.user_id,
      username: identity.username,
      displayName: identity.display_name,
      restQueryOk: users.records.length === 1,
      refreshTokenIssued: Boolean(req.session.salesforce?.refreshToken),
      grantedScopes: req.session.salesforce?.scope ?? null,
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SalesforceError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...(err.status === 401 ? { loginUrl: '/oauth/login' } : {}) });
  }
  console.error('[server] unexpected error', (err as Error)?.message);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
});

app.listen(config.port, () => {
  console.info(`Maid Bright backend listening on http://localhost:${config.port}`);
  console.info(`Salesforce login: http://localhost:${config.port}/oauth/login`);
});
