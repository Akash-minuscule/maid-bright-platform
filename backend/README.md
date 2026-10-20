# Maid Bright backend

Milestone 1: real Salesforce API connectivity using the OAuth 2.0 **Authorization Code flow** with PKCE (Web Server flow). There are no Maid Bright features yet and the frontend is unchanged.

## Install

```bash
cd backend
npm install
cp .env.example .env   # then fill in the values
```

Requires Node 22 or newer.

## Configure (`backend/.env`)

| Variable           | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `SF_CLIENT_ID`     | Consumer Key of your External Client App / Connected App                                  |
| `SF_CLIENT_SECRET` | Consumer Secret                                                                           |
| `SF_CALLBACK_URL`  | `http://localhost:8000/oauth/callback`. Must match the app's Callback URL exactly.        |
| `SF_LOGIN_URL`     | `https://login.salesforce.com` (prod/dev), `https://test.salesforce.com` (sandbox), or your My Domain URL |
| `PORT` (optional)  | Defaults to the port in `SF_CALLBACK_URL`                                                 |

The server refuses to start if a value is missing or still a placeholder. `.env` is git-ignored.

## Salesforce setup

In **Setup → External Client App Manager** (or App Manager for a classic Connected App), open your app and check:

1. **Enable OAuth** is on.
2. **Callback URL** is exactly `http://localhost:8000/oauth/callback`.
3. **OAuth scopes** include:
   - *Manage user data via APIs (`api`)*
   - *Perform requests at any time (`refresh_token`, `offline_access`)*
4. **Enable Authorization Code and Credentials Flow** is on. **Require secret for Web Server Flow** can stay on, because this server sends the secret.
5. **Require PKCE** can be on or off; the server always sends PKCE.
6. Under **Policies**:
   - Set *Permitted Users* to "All users may self-authorize", or pre-approve the logging-in user through a profile or permission set.
   - For a refresh token, set the refresh token policy to "valid until revoked" or a timed expiry.
7. Wait for the changes to propagate. This can take up to 10 minutes.
8. The user who logs in needs the **API Enabled** permission.

## Run

```bash
npm run dev     # auto-restart on change
# or
npm start
```

Open **http://localhost:8000/oauth/login**. Log in to Salesforce and approve access. You'll be sent back to `http://localhost:8000/`, which shows "Connected". Then open **http://localhost:8000/api/salesforce/health**.

## Endpoints

| Route                        | Purpose                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `GET /oauth/login`           | Creates a one-time `state` and PKCE verifier, then redirects to Salesforce's authorize page |
| `GET /oauth/callback`        | Checks `state`, handles Salesforce errors, swaps the code for tokens and verifies the response signature |
| `POST /oauth/logout`         | Revokes the token and ends the session                                              |
| `GET /api/salesforce/health` | `authenticated: false` until you log in. After login it calls the identity URL, `/services/data/` and a SOQL query |
| `GET /api/salesforce/identity` | The logged-in user's ID, org ID and username, read live from Salesforce. `401 NOT_AUTHENTICATED` before login |

Expected health response after login:

```json
{
  "configured": true,
  "authenticated": true,
  "salesforce": {
    "instanceUrl": "https://<your-domain>.my.salesforce.com",
    "apiVersion": "66.0",
    "orgId": "00D…",
    "userId": "005…",
    "username": "you@example.com",
    "displayName": "…",
    "restQueryOk": true,
    "refreshTokenIssued": true,
    "grantedScopes": "refresh_token api"
  }
}
```

## Security model (local development)

- **Tokens stay on the server.** They're kept in an in-memory session store and never appear in URLs, response bodies, logs or browser storage. The browser only holds an opaque random `mb_sid` cookie (HttpOnly, SameSite=Lax; also `Secure` when the callback is https).
- **`state` protects against CSRF.** It's 256-bit random, single-use, expires after 10 minutes and is compared in constant time. The session ID is replaced after login.
- **Token responses are checked.** The HMAC `signature` is verified with the client secret. `instance_url` and the identity URL must be https Salesforce hosts.
- **Refresh is automatic.** On a 401 the server refreshes the token once (when a refresh token exists) and retries; parallel requests share a single refresh. If no refresh token was issued, or it's revoked, the API returns `401 REAUTH_REQUIRED` with a `loginUrl`.
- **Sessions don't survive a restart.** Restarting the server clears every session, so log in again. A shared or production deployment needs a persistent, encrypted session store and https.

## Troubleshooting

| Symptom                                       | Fix                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`                       | The app's Callback URL must be exactly `SF_CALLBACK_URL`                              |
| `invalid_client_id` / `OAUTH_EC_APP_NOT_FOUND` | Wrong Consumer Key, the app is in a different org than the one you log in to, or changes haven't propagated yet |
| `invalid_client` on callback                  | Wrong Consumer Secret                                                                 |
| `OAUTH_APP_ACCESS_DENIED` / "user is not admin approved" | Set Permitted Users to self-authorize, or assign the app to the user's profile or permission set |
| `refreshTokenIssued: false`                   | Add the `refresh_token` scope and set a refresh token policy                          |
| Sandbox login fails                           | Use `SF_LOGIN_URL=https://test.salesforce.com` or the sandbox My Domain URL           |

## Customer login and onboarding (local SQLite)

Customers sign in to the app with an email and password. This is separate from the Salesforce login above. Customers never get Salesforce tokens; the backend calls Salesforce for them using its own **integration connection**.

### 1. Connect the backend to Salesforce (once)

1. Add these to `backend/.env`:
   - `ADMIN_SF_USER_IDS`: the Salesforce User ID allowed to connect the backend (005…).
   - `TOKEN_ENCRYPTION_KEY`: 32 random bytes in base64. Generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
2. Restart the backend.
3. Open `/oauth/login` as that user. `/` should then show **Customer app connection: connected**.

How the connection is kept:

- Its refresh token is saved encrypted (AES-256-GCM), so it survives restarts. Without `TOKEN_ENCRYPTION_KEY` it's kept in memory only.
- Logging out at `/oauth/logout` does not revoke the token while it powers the customer app.
- If Salesforce revokes the token, customer requests return `503 INTEGRATION_NOT_CONNECTED` until someone logs in again.

### 2. How customers get a login

| Flow | Steps |
| --- | --- |
| Existing Salesforce customer | Email → code → check Salesforce → create password |
| New customer | Name, email and phone → code → create password → business Account + Contact created |

**Existing customers:**

- The code is always sent, and the answer is always the same, so nobody can tell whether an email is in Salesforce.
- After the code is verified, the backend looks up Contacts with that email:
  - **exactly one** with an Account: the login is linked to it;
  - **none**: the customer is told to create a new account;
  - **several**: the customer is told to contact Maid Bright. Nothing is picked automatically.
- The match is checked again when the password is saved.

**New customers:**

- Account and Contact are created in one all-or-nothing Composite request, so you never get one without the other.
- The Account's record type is read from the connected org, never hard-coded. It uses an active business (non-person) Account record type available to the integration user: the user's default, or the only one available. To choose a specific one, set `SF_ACCOUNT_RECORD_TYPE=<DeveloperName>` in `.env`.
- The Master record type is never used, because Salesforce rejects it once an object has record types.
- Watch the labels: in the demo org, the business type is called "Person Account" (`Person_Account`).
- If the email already exists in Salesforce, the customer is sent to the existing-customer flow instead.
- A double submit can't create two records.
- If Salesforce's reply is lost, the backend looks for the Contact it may have created before trying again.
- A duplicate-rule rejection is shown as "contact Maid Bright".

**Codes:**

- 6 digits, valid for 10 minutes.
- 5 wrong tries, then the customer must ask for a new code.
- 60 seconds between resends, at most 6 codes per email per hour.
- Only a keyed hash of the code is stored.
- How codes are sent is set by `OTP_EMAIL_PROVIDER`:
  - `console` (default, localhost only): the code is printed in the backend terminal.
  - `salesforce`: real email through the org's `emailSimple` action. Developer Edition orgs have a small daily email limit, and deliverability must allow email.

### 3. Sessions and security

- **Storage.** `backend/data/maidbright.db` (git-ignored), created automatically.
  - Passwords are stored only as scrypt hashes, at least 12 characters long.
  - Session tokens are stored only as SHA-256 hashes.
- **Session.** An `mb_customer` cookie (HttpOnly, SameSite=Lax). It expires after 24 hours idle or 7 days at most, and survives restarts.
- **Login lockout.** After 5 failures per email (or 20 per IP) within 15 minutes, login returns `429`.
- **Generic login error.** A wrong password, an unknown email and a customer who hasn't set a password yet all get the same error, which points to the first-time setup link.
- **Allowed callers.** Only `FRONTEND_ORIGINS` get CORS access. POSTs from other websites get `403`.
- **Linked records.** Contact, Account and org IDs live only on the server (`req.customer.salesforce`). The app never sends or receives them.

### Endpoints (`/api/customer`)

All errors use the format `{ "error": CODE, "message": text }`.

| Route | Purpose |
| --- | --- |
| `POST /login` | `{ email, password }` → sets the session cookie, returns `{ customer }` |
| `GET /me` | The signed-in customer, or `401 NOT_SIGNED_IN` |
| `POST /logout` | Ends the session |
| `GET /appointments` | The customer's Service Appointments, using `WHERE AccountId = <session Account>` |
| `POST /activation/start` | `{ email }` → `202 { verificationId, message, resendInSeconds }`. The answer is the same for every email |
| `POST /registration/start` | `{ firstName, lastName, email, phone }` → same answer as above |
| `POST /otp/verify` | `{ verificationId, code }` → `{ status }` (see below) |
| `POST /otp/resend` | `{ verificationId }`, with the cooldown and limits above |
| `POST /activation/complete` | `{ verificationId, password, confirmPassword }` → `201 { customer }` and signs the customer in |
| `POST /registration/complete` | Same as above, and creates the Salesforce Account + Contact |

`/otp/verify` returns one of these statuses:

- `READY`: the customer can create a password.
- `NO_MATCH`, `MULTIPLE_MATCHES`: existing-customer flow could not link a single Contact.
- `EXISTING_CUSTOMER`: registration flow found the email in Salesforce.
- `ALREADY_ACTIVATED`, `ALREADY_REGISTERED`: a login already exists for this email.

Run `npm test` to run all of these flows against a fake Salesforce API.

## Salesforce external Customer Users

After a customer verifies their email and is linked to a Contact (password setup or new registration), the backend provisions **one external Customer User** for that Contact. This happens **in the background**:

- The sign-up response, Maid Bright login, sessions and appointment access never wait for it or depend on it.
- Customers don't log in to Salesforce with it. Customer OAuth and Experience Cloud login aren't configured.

**Settings** (`.env`):
- `SF_CUSTOMER_PROFILE_ID` (an external profile, `00e…`) and `SF_CUSTOMER_USERNAME_SUFFIX` (e.g. `maidbright.demo`).
- Optional: `SF_CUSTOMER_TIMEZONE`, `SF_CUSTOMER_LOCALE`, `SF_CUSTOMER_LANGUAGE`.

**How provisioning works:**
- **Reuse first.** An existing User for the Contact is linked, never duplicated. If that User is inactive, it's linked but not reactivated, because reactivating uses a licence.
- **External profiles only.** The profile's `UserType` must be external (`CspLitePortal`, `CustomerSuccess`, `PowerCustomerSuccess`, `PowerPartner`). Anything else is refused, so an internal User is never created.
- **Separate transaction.** The User insert is its own REST call, never combined with Account/Contact DML.
- **Fields set:** `ContactId`, `ProfileId`, `Username`, `Email`, `FirstName`, `LastName`, `Alias`, `CommunityNickname`, `TimeZoneSidKey`, `LocaleSidKey`, `EmailEncodingKey`, `LanguageLocaleKey`. No password is sent.
- **Username:** `<email>.<suffix>`. If that's taken, it falls back to `<contactId>@<suffix>`. Nicknames have a fallback too.
- **Result stored** on `customer_salesforce_links`: `sf_user_id`, `user_status`, `user_error`, `user_attempts`, `user_next_attempt_at`.

| Status | Meaning | Retry |
|---|---|---|
| `provisioned` | User created or reused | none |
| `failed` | Temporary (timeout, connection lost, unexpected) | after 1, 5, 15, 60, then every 240 minutes. A retry first looks for a User created by a lost request |
| `blocked` | Needs a Salesforce or `.env` fix: `NOT_CONFIGURED`, `PROFILE_NOT_FOUND`, `PROFILE_NOT_EXTERNAL`, `LICENSE_LIMIT_EXCEEDED`, `ACCOUNT_OWNER_ROLE_MISSING`, `DUPLICATE_USERNAME`, `USER_INACTIVE`, `CONFIGURATION_ERROR`, `LINK_CONFLICT` | every 6 hours, and for every customer at each backend restart |
