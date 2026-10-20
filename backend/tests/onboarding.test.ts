import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { openDatabase } from '../src/db.ts';

// Runs the real backend against a throwaway database and a small fake Salesforce REST API (a test double, so
// no real records are created and no email is sent). Codes are read from the console OTP provider's output.
const PORT = 8013;
const FAKE_SF_PORT = 8014;
const BASE = `http://localhost:${PORT}`;
const APP_ORIGIN = 'http://localhost:8081';
const ORG = '00Dfj00000Jmj6LEAR';
const INTEGRATION_USER = '005fj00000CbgW1AAJ';
const KEY = randomBytes(32);
const BUSINESS_RT = '012000000000BUSAAA';
const PERSON_RT = '012000000000PERAAA';
const MASTER_RT = '012000000000000AAA';

// ---------- Fake Salesforce ----------
interface FakeContact { Id: string; AccountId: string | null; FirstName: string; LastName: string; Phone: string; Email: string }
const contacts: FakeContact[] = [
  { Id: '003000000000001AAA', AccountId: '001000000000001AAA', FirstName: 'Sarah', LastName: 'Mitchell', Phone: '(214) 555-0147', Email: 'sarah@example.com' },
  { Id: '003000000000002AAA', AccountId: '001000000000002AAA', FirstName: 'Dana', LastName: 'Lee', Phone: '', Email: 'twin@example.com' },
  { Id: '003000000000003AAA', AccountId: '001000000000003AAA', FirstName: 'Dana', LastName: 'Lee', Phone: '', Email: 'twin@example.com' },
  { Id: '003000000000004AAA', AccountId: '001000000000004AAA', FirstName: 'Omar', LastName: 'Haddad', Phone: '', Email: 'omar@example.com' },
];
// Shaped like real rows. Ids and package fields are included on purpose: they must never reach the app.
const fullVisit = {
  WorkType: { Name: 'Standard Home Cleaning' }, ServiceTerritory: { Name: 'Maid Bright - Dallas, TX' },
  SchedStartTime: null, SchedEndTime: null, ArrivalWindowStartTime: null, ArrivalWindowEndTime: null,
  EarliestStartTime: '2026-10-21T13:00:00.000+0000', DueDate: '2026-10-23T23:00:00.000+0000', Duration: 3, DurationType: 'Hours',
  Street: '1 Main St', City: 'Dallas', State: 'Texas', PostalCode: '75214', Description: 'Standard clean', CancellationReason: null,
  ServiceResources: null, FSL__Pinned__c: false, OwnerId: '005000000000001AAA',
};
const appointments = [
  { ...fullVisit, Id: '08p000000000001AAA', AccountId: '001000000000001AAA', AppointmentNumber: 'SA-0001', Status: 'None', StatusCategory: 'None' },
  { ...fullVisit, Id: '08p000000000002AAA', AccountId: '001000000000001AAA', AppointmentNumber: 'SA-0004', Status: 'Completed', StatusCategory: 'Completed',
    SchedStartTime: '2026-09-28T15:00:00.000+0000', SchedEndTime: '2026-09-28T18:00:00.000+0000',
    ArrivalWindowStartTime: '2026-09-28T15:00:00.000+0000', ArrivalWindowEndTime: '2026-09-28T17:00:00.000+0000',
    ServiceResources: { totalSize: 1, records: [{ ServiceResource: { Name: 'Michael J' } }] } },
  { ...fullVisit, Id: '08p000000000005AAA', AccountId: '001000000000001AAA', AppointmentNumber: 'SA-0005', Status: 'Canceled', StatusCategory: 'Canceled',
    CancellationReason: 'Customer travelling' },
  // Created straight under the Account: no work type, territory, address or notes.
  { ...fullVisit, Id: '08p000000000006AAA', AccountId: '001000000000001AAA', AppointmentNumber: 'SA-0006', Status: 'None', StatusCategory: 'None',
    WorkType: null, ServiceTerritory: null, Street: null, City: null, State: null, PostalCode: null, Description: null, Duration: 1 },
  { ...fullVisit, Id: '08p000000000003AAA', AccountId: '001000000000004AAA', AppointmentNumber: 'SA-0099', Status: 'Scheduled', StatusCategory: 'Scheduled',
    SchedStartTime: '2026-11-02T15:00:00.000+0000', SchedEndTime: '2026-11-02T18:00:00.000+0000' },
];
const soqlSeen: string[] = [];
const composites: Array<{ allOrNone: boolean; compositeRequest: Array<{ url: string; body: Record<string, string> }> }> = [];
let nextComposite: 'ok' | 'duplicate' = 'ok';
let created = 0;

function fakeSalesforce(): Server {
  return createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const url = new URL(req.url!, `http://localhost:${FAKE_SF_PORT}`);
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/services/data/') return json(200, [{ version: '66.0' }]);
      // Mirrors the demo org: the business type is labelled "Person Account", and Master is listed as available.
      if (url.pathname === '/services/data/v66.0/sobjects/Account/describe')
        return json(200, { recordTypeInfos: [
          { recordTypeId: BUSINESS_RT, developerName: 'Person_Account', name: 'Person Account', active: true, available: true, master: false, defaultRecordTypeMapping: true },
          { recordTypeId: PERSON_RT, developerName: 'PersonAccount', name: 'Person Account', active: true, available: false, master: false, defaultRecordTypeMapping: false },
          { recordTypeId: MASTER_RT, developerName: 'Master', name: 'Master', active: true, available: true, master: true, defaultRecordTypeMapping: false },
        ] });
      if (url.pathname === '/services/data/v66.0/query') {
        const q = url.searchParams.get('q')!;
        soqlSeen.push(q);
        if (/FROM RecordType/.test(q)) return json(200, { records: [{ Id: PERSON_RT }] });
        if (/FROM Contact/.test(q)) {
          const email = q.match(/Email = '([^']+)'/)![1]!.toLowerCase();
          return json(200, { records: contacts.filter((c) => c.Email.toLowerCase() === email) });
        }
        if (/FROM ServiceAppointment/.test(q)) {
          const account = q.match(/WHERE AccountId = '([^']+)'/)![1];
          return json(200, { records: appointments.filter((a) => a.AccountId === account) });
        }
      }
      if (url.pathname === '/services/data/v66.0/composite' && req.method === 'POST') {
        const body = JSON.parse(raw);
        composites.push(body);
        if (body.compositeRequest[0].body.RecordTypeId !== BUSINESS_RT) // what the real org does for Master
          return json(200, { compositeResponse: [
            { referenceId: 'account', httpStatusCode: 400, body: [{ errorCode: 'INVALID_CROSS_REFERENCE_KEY', message: "Record Type ID: this ID value isn't valid for the user", fields: ['RecordTypeId'] }] },
            { referenceId: 'contact', httpStatusCode: 400, body: [{ errorCode: 'PROCESSING_HALTED', message: 'halted' }] },
          ] });
        if (nextComposite === 'duplicate') {
          nextComposite = 'ok';
          return json(200, { compositeResponse: [
            { referenceId: 'account', httpStatusCode: 400, body: [{ errorCode: 'PROCESSING_HALTED', message: 'halted' }] },
            { referenceId: 'contact', httpStatusCode: 400, body: [{ errorCode: 'DUPLICATES_DETECTED', message: 'dup' }] },
          ] });
        }
        created++;
        const accountId = `001N0000000000${created}AAA`.slice(0, 18);
        const contactId = `003N0000000000${created}AAA`.slice(0, 18);
        const c = body.compositeRequest[1].body;
        contacts.push({ Id: contactId, AccountId: accountId, FirstName: c.FirstName, LastName: c.LastName, Phone: c.Phone, Email: c.Email });
        return json(200, { compositeResponse: [
          { referenceId: 'account', httpStatusCode: 201, body: { id: accountId } },
          { referenceId: 'contact', httpStatusCode: 201, body: { id: contactId } },
        ] });
      }
      json(404, [{ errorCode: 'NOT_FOUND', message: `fake has no ${req.method} ${url.pathname}` }]);
    });
  });
}

// ---------- Backend under test ----------
const dir = mkdtempSync(join(tmpdir(), 'mb-onboarding-test-'));
const dbPath = join(dir, 'test.db');
let server: ChildProcess | undefined;
let fake: Server;
let output = '';

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((p) => p.toString('base64')).join('.');
}

before(async () => {
  fake = fakeSalesforce();
  await new Promise<void>((r) => fake.listen(FAKE_SF_PORT, r));
  const db = openDatabase(dbPath);
  db.prepare(
    `INSERT INTO integration_connection (id, sf_user_id, org_id, instance_url, identity_url, scope, refresh_token_enc, connected_at)
     VALUES (1, ?, ?, ?, ?, 'api refresh_token', ?, ?)`,
  ).run(INTEGRATION_USER, ORG, `http://localhost:${FAKE_SF_PORT}`, `https://login.salesforce.com/id/${ORG}/${INTEGRATION_USER}`, encrypt('fake-refresh'), Date.now());
  db.close();
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    env: { ...process.env, PORT: String(PORT), MB_DB_PATH: dbPath, FRONTEND_ORIGINS: APP_ORIGIN, ADMIN_SF_USER_IDS: INTEGRATION_USER,
      TOKEN_ENCRYPTION_KEY: KEY.toString('base64'), OTP_EMAIL_PROVIDER: 'console' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout!.on('data', (chunk) => (output += chunk));
  server.stderr!.on('data', (chunk) => (output += chunk));
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${BASE}/api/customer/me`).then(() => true, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${output}`);
});

after(async () => {
  if (server) {
    const exited = new Promise((r) => server!.once('exit', r));
    server.kill();
    await exited;
  }
  await new Promise((r) => fake.close(r));
  rmSync(dir, { recursive: true, force: true });
});

async function post(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${BASE}/api/customer${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.match(/mb_customer=[^;]+/)?.[0] };
}
const get = async (path: string, cookie: string) => {
  const res = await fetch(`${BASE}/api/customer${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, body: await res.json() };
};

/** The latest code the console provider printed for this email. */
async function codeFor(email: string) {
  for (let i = 0; i < 50; i++) {
    const matches = [...output.matchAll(new RegExp(`\\[otp:console\\] code for ${email.replace('.', '\\.')}: (\\d{6})`, 'g'))];
    if (matches.length) return matches.at(-1)![1]!;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no code printed for ${email}`);
}

const PASSWORD = 'Sparkling-Clean-42';

test('existing Salesforce customer: generic start, OTP, password, login, own appointments only', async () => {
  const known = await post('/activation/start', { email: 'Sarah@Example.com ' });
  const unknown = await post('/activation/start', { email: 'nobody@example.com' });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  const strip = ({ verificationId: _, ...rest }: Record<string, unknown>) => rest;
  assert.deepEqual(strip(known.body), strip(unknown.body), 'start must not reveal whether the email is known');
  const id = known.body.verificationId;
  const code = await codeFor('sarah@example.com');
  assert.ok(!JSON.stringify(known.body).includes(code), 'the code is never returned to the app');
  const wrong = await post('/otp/verify', { verificationId: id, code: code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, 'INVALID_CODE');
  assert.equal(wrong.body.attemptsRemaining, 4);

  const notYet = await post('/activation/complete', { verificationId: id, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(notYet.status, 410, 'cannot set a password before the email is verified');

  const verified = await post('/otp/verify', { verificationId: id, code });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'READY');
  assert.equal(verified.body.firstName, 'Sarah');

  const mismatch = await post('/activation/complete', { verificationId: id, password: PASSWORD, confirmPassword: 'Different-42-x' });
  assert.equal(mismatch.status, 400);
  const done = await post('/activation/complete', { verificationId: id, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(done.status, 201);
  assert.equal(done.body.customer.firstName, 'Sarah');
  assert.ok(done.cookie);
  assert.doesNotMatch(JSON.stringify(done.body), /003000|001000|00Dfj/, 'no Salesforce IDs reach the app');

  const again = await post('/activation/complete', { verificationId: id, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(again.status, 410, 'a verification can be used only once');

  const login = await post('/login', { email: 'sarah@example.com', password: PASSWORD });
  assert.equal(login.status, 200);
  const list = await get('/appointments', login.cookie!);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.appointments.map((a: { reference: string }) => a.reference).sort(), ['SA-0001', 'SA-0004', 'SA-0005', 'SA-0006']);
  assert.ok(soqlSeen.some((q) => q.includes("WHERE AccountId = '001000000000001AAA'")), 'query is filtered by the session Account');
  assert.doesNotMatch(JSON.stringify(list.body), /08p0|001000|005000|FSL__|"Id"|"id"/, 'no Salesforce IDs or package fields reach the app');
  const byRef = Object.fromEntries(list.body.appointments.map((a: { reference: string }) => [a.reference, a]));

  assert.deepEqual(byRef['SA-0001'], {
    reference: 'SA-0001', serviceName: 'Standard Home Cleaning', workType: 'Standard Home Cleaning', status: 'Requested', statusDetail: null,
    scheduled: false, scheduledStart: '2026-10-21T13:00:00.000Z', scheduledEnd: '2026-10-23T23:00:00.000Z',
    requestedWindow: { start: '2026-10-21T13:00:00.000Z', end: '2026-10-23T23:00:00.000Z' }, arrivalWindow: null,
    duration: { value: 3, unit: 'hours' }, address: { line1: '1 Main St', city: 'Dallas', state: 'Texas', postalCode: '75214' },
    territory: 'Maid Bright - Dallas, TX', cleaners: [], notes: 'Standard clean', cancellationReason: null,
  });
  assert.equal(byRef['SA-0004'].status, 'Completed');
  assert.equal(byRef['SA-0004'].scheduled, true);
  assert.deepEqual(byRef['SA-0004'].arrivalWindow, { start: '2026-09-28T15:00:00.000Z', end: '2026-09-28T17:00:00.000Z' });
  assert.deepEqual(byRef['SA-0004'].cleaners, ['Michael J']);
  assert.equal(byRef['SA-0005'].status, 'Cancelled');
  assert.equal(byRef['SA-0005'].cancellationReason, 'Customer travelling');
  // Missing data comes back as null, not as empty or made-up values.
  assert.equal(byRef['SA-0006'].workType, null);
  assert.equal(byRef['SA-0006'].serviceName, 'Home cleaning');
  assert.equal(byRef['SA-0006'].territory, null);
  assert.equal(byRef['SA-0006'].address, null);
  assert.equal(byRef['SA-0006'].notes, null);
  assert.deepEqual(byRef['SA-0006'].duration, { value: 1, unit: 'hours' });
});

test('a second activation for an already activated email is refused after verification', async () => {
  const start = await post('/activation/start', { email: 'sarah@example.com' });
  const verified = await post('/otp/verify', { verificationId: start.body.verificationId, code: await codeFor('sarah@example.com') });
  assert.equal(verified.body.status, 'ALREADY_ACTIVATED');
  const done = await post('/activation/complete', { verificationId: start.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(done.status, 409);
});

test('no match and duplicate Salesforce matches never create a login', async () => {
  const none = await post('/activation/start', { email: 'ghost@example.com' });
  const noneResult = await post('/otp/verify', { verificationId: none.body.verificationId, code: await codeFor('ghost@example.com') });
  assert.equal(noneResult.body.status, 'NO_MATCH');

  const twins = await post('/activation/start', { email: 'twin@example.com' });
  const twinResult = await post('/otp/verify', { verificationId: twins.body.verificationId, code: await codeFor('twin@example.com') });
  assert.equal(twinResult.body.status, 'MULTIPLE_MATCHES');
  const done = await post('/activation/complete', { verificationId: twins.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(done.status, 409);
  assert.equal((await post('/login', { email: 'twin@example.com', password: PASSWORD })).status, 401);
});

test('new customer: OTP, password, business Account + Contact in one atomic request, login, no appointments', async () => {
  const details = { firstName: 'Taylor', lastName: 'Brooks', email: 'taylor@example.com', phone: '214 555 0199' };
  const start = await post('/registration/start', details);
  assert.equal(start.status, 202);
  const verified = await post('/otp/verify', { verificationId: start.body.verificationId, code: await codeFor('taylor@example.com') });
  assert.equal(verified.body.status, 'READY');

  const done = await post('/registration/complete', { verificationId: start.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(done.status, 201);
  const request = composites.at(-1)!;
  assert.equal(request.allOrNone, true);
  assert.equal(request.compositeRequest[0]!.body.RecordTypeId, BUSINESS_RT, 'business type read from the org, not Master or a person type');
  assert.equal(request.compositeRequest[0]!.body.Name, 'Taylor Brooks Household');
  assert.equal(request.compositeRequest[1]!.body.AccountId, '@{account.id}');
  assert.equal(request.compositeRequest[1]!.body.Email, 'taylor@example.com');

  const dup = await post('/registration/complete', { verificationId: start.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(dup.status, 410, 'a double submit cannot create a second Account');
  assert.equal(composites.length, 1);

  const login = await post('/login', { email: 'taylor@example.com', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.deepEqual((await get('/appointments', login.cookie!)).body.appointments, []);
});

test('registering with an email that already belongs to a Salesforce customer is redirected, not duplicated', async () => {
  const start = await post('/registration/start', { firstName: 'Omar', lastName: 'Haddad', email: 'omar@example.com', phone: '2145550100' });
  const verified = await post('/otp/verify', { verificationId: start.body.verificationId, code: await codeFor('omar@example.com') });
  assert.equal(verified.body.status, 'EXISTING_CUSTOMER');
  const done = await post('/registration/complete', { verificationId: start.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(done.status, 409);
});

test('a Salesforce duplicate-rule rejection is reported and can be retried', async () => {
  const start = await post('/registration/start', { firstName: 'Riley', lastName: 'Cho', email: 'riley@example.com', phone: '2145550111' });
  await post('/otp/verify', { verificationId: start.body.verificationId, code: await codeFor('riley@example.com') });
  nextComposite = 'duplicate';
  const rejected = await post('/registration/complete', { verificationId: start.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.error, 'DUPLICATE_RECORD');
  const retry = await post('/registration/complete', { verificationId: start.body.verificationId, password: PASSWORD, confirmPassword: PASSWORD });
  assert.equal(retry.status, 201, 'the verification was released, so a retry works');
});

test('resend has a cooldown, and five wrong codes lock the code', async () => {
  const start = await post('/activation/start', { email: 'locked@example.com' });
  const resend = await post('/otp/resend', { verificationId: start.body.verificationId });
  assert.equal(resend.status, 429);
  assert.equal(resend.body.error, 'RESEND_TOO_SOON');
  assert.ok(resend.body.resendInSeconds > 0);

  const code = await codeFor('locked@example.com');
  const wrongCode = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.equal((await post('/otp/verify', { verificationId: start.body.verificationId, code: wrongCode })).status, 400);
  assert.equal((await post('/otp/verify', { verificationId: start.body.verificationId, code: wrongCode })).body.error, 'TOO_MANY_ATTEMPTS');
  const late = await post('/otp/verify', { verificationId: start.body.verificationId, code });
  assert.equal(late.body.error, 'TOO_MANY_ATTEMPTS', 'even the right code is refused after the limit');
});

test('login errors are generic and do not reveal unactivated Salesforce customers', async () => {
  const unactivated = await post('/login', { email: 'omar@example.com', password: PASSWORD }); // in Salesforce, no login
  const unknown = await post('/login', { email: 'nobody@example.com', password: PASSWORD });
  const wrong = await post('/login', { email: 'sarah@example.com', password: 'Wrong-password-99' });
  assert.equal(unactivated.status, 401);
  assert.deepEqual(unactivated.body, unknown.body);
  assert.deepEqual(unknown.body, wrong.body);
  assert.match(wrong.body.message, /Existing customer\? Activate your account/);
});

test('appointments need a session and logout ends it', async () => {
  assert.equal((await fetch(`${BASE}/api/customer/appointments`)).status, 401);
  const login = await post('/login', { email: 'sarah@example.com', password: PASSWORD });
  assert.equal((await post('/logout', {}, login.cookie)).status, 204);
  assert.equal((await get('/appointments', login.cookie!)).status, 401);
});
