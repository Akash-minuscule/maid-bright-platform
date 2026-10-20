import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { CustomerStore } from '../src/customerStore.ts';
import { openDatabase } from '../src/db.ts';
import { hashPassword } from '../src/passwords.ts';

// Runs the real server (src/server.ts) against a throwaway database on a spare port.
// Needs backend/.env to exist because the server loads its Salesforce settings at startup.
const PORT = 8011;
const BASE = `http://localhost:${PORT}`;
const APP_ORIGIN = 'http://localhost:8081';
const EMAIL = 'sarah.mitchell@example.com';
const PASSWORD = 'Correct-Horse-42';

const dir = mkdtempSync(join(tmpdir(), 'mb-auth-test-'));
const dbPath = join(dir, 'test.db');
let server: ChildProcess | undefined;

async function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    env: { ...process.env, PORT: String(PORT), MB_DB_PATH: dbPath, FRONTEND_ORIGINS: APP_ORIGIN, ADMIN_SF_USER_IDS: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${BASE}/api/customer/me`).then(() => true, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

async function stopServer() {
  if (!server) return;
  const exited = new Promise((r) => server!.once('exit', r));
  server.kill();
  await exited;
  server = undefined;
}

const cookieFrom = (res: Response) => res.headers.get('set-cookie')?.match(/mb_customer=([^;]*)/)?.[1];

function login(email: string, password: string, origin = APP_ORIGIN) {
  return fetch(`${BASE}/api/customer/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email, password }),
  });
}

const me = (cookie: string) => fetch(`${BASE}/api/customer/me`, { headers: { Cookie: `mb_customer=${cookie}` } });

before(async () => {
  const db = openDatabase(dbPath);
  new CustomerStore(db).create({
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Sarah',
    lastName: 'Mitchell',
    phone: '',
    salesforce: { orgId: '00Dfj00000Jmj6LEAR', contactId: '003fj00001oWnJdAAK', accountId: '001fj000022Xb53AAC' },
    verifiedBySfUserId: '005fj00000CbgW1AAJ',
  });
  db.close();
  await startServer();
});

after(async () => {
  await stopServer();
  rmSync(dir, { recursive: true, force: true });
});

test('protected route rejects requests without a session', async () => {
  const res = await fetch(`${BASE}/api/customer/me`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'NOT_SIGNED_IN');
});

test('wrong password and unknown email get the same generic answer', async () => {
  const wrong = await login(EMAIL, 'Not-The-Password-1');
  const unknown = await login('nobody@example.com', PASSWORD);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(cookieFrom(wrong), undefined);
});

test('login sets an HttpOnly cookie, returns no secrets, and works across a server restart until logout', async () => {
  const res = await login(` ${EMAIL.toUpperCase()} `, PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), APP_ORIGIN);
  const setCookie = res.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.customer).sort(), ['email', 'firstName', 'id', 'lastName', 'phone']);
  assert.equal(body.customer.email, EMAIL);
  assert.doesNotMatch(JSON.stringify(body), /003fj|001fj|scrypt|password/i);

  const cookie = cookieFrom(res)!;
  assert.equal((await me(cookie)).status, 200);

  await stopServer();
  await startServer();
  const afterRestart = await me(cookie);
  assert.equal(afterRestart.status, 200, 'session should survive a backend restart');
  assert.equal((await afterRestart.json()).customer.email, EMAIL);

  const out = await fetch(`${BASE}/api/customer/logout`, {
    method: 'POST',
    headers: { Cookie: `mb_customer=${cookie}`, Origin: APP_ORIGIN },
  });
  assert.equal(out.status, 204);
  assert.equal((await me(cookie)).status, 401, 'old cookie must stop working after logout');
});

test('database holds only hashes, never the password or the session token', async () => {
  const res = await login(EMAIL, PASSWORD);
  const cookie = cookieFrom(res)!;
  const db = openDatabase(dbPath);
  const customer = db.prepare('SELECT password_hash FROM customers').get() as { password_hash: string };
  const sessions = db.prepare('SELECT token_hash FROM customer_sessions').all() as Array<{ token_hash: string }>;
  db.close();
  assert.match(customer.password_hash, /^scrypt\$131072\$8\$1\$/);
  assert.ok(!customer.password_hash.includes(PASSWORD));
  assert.ok(sessions.length > 0);
  assert.ok(sessions.every((s) => s.token_hash !== cookie));
});

test('requests from other websites are refused', async () => {
  const res = await login(EMAIL, PASSWORD, 'https://evil.example');
  assert.equal(res.status, 403);
  const preflight = await fetch(`${BASE}/api/customer/login`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
});

test('repeated failures lock the email for 15 minutes', async () => {
  const email = 'locked@example.com';
  for (let i = 0; i < 5; i++) assert.equal((await login(email, 'Wrong-password-0')).status, 401);
  const blocked = await login(email, 'Wrong-password-0');
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, 'TOO_MANY_ATTEMPTS');
});
