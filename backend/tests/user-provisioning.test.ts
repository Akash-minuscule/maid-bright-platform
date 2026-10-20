import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aliasFor,
  nextAttemptDelayMs,
  provisionCustomerUser,
  type CustomerUserSettings,
  type SalesforceUserApi,
} from '../src/userProvisioning.ts';

const settings: CustomerUserSettings = {
  profileId: '00e000000000001AAA',
  usernameSuffix: 'maidbright.demo',
  timeZone: 'America/Chicago',
  locale: 'en_US',
  language: 'en_US',
  emailEncoding: 'UTF-8',
};
const customer = { email: 'taylor@example.com', firstName: 'Taylor', lastName: 'Brooks', contactId: '003000000000123ABC' };

/** Errors shaped like the real Salesforce client's (SalesforceError + sfErrorCode / unreachable). */
const sfError = (sfErrorCode: string, message: string) =>
  Object.assign(new Error(message), { code: 'SALESFORCE_UNAVAILABLE', sfErrorCode });
const timeout = () => Object.assign(new Error('Could not reach Salesforce.'), { code: 'SALESFORCE_UNAVAILABLE', unreachable: true });

/** A fake org: users by Contact, a profile type, and a createUser that can be scripted to fail. */
function fakeOrg(options: { userType?: string | undefined; failures?: unknown[]; createdPersists?: boolean } = {}) {
  const users = new Map<string, { Id: string; IsActive: boolean }>();
  const created: Array<Record<string, string>> = [];
  const failures = [...(options.failures ?? [])];
  const api: SalesforceUserApi = {
    findUserByContact: async (contactId) => users.get(contactId),
    getProfileUserType: async () => ('userType' in options ? options.userType : 'CspLitePortal'),
    createUser: async (fields) => {
      const failure = failures.shift();
      if (failure && !(options.createdPersists && (failure as { unreachable?: boolean }).unreachable)) throw failure;
      const id = `005CUST0000000${created.length + 1}AA`;
      created.push(fields);
      users.set(fields.ContactId!, { Id: id, IsActive: true });
      if (failure) throw failure; // the request "timed out" after Salesforce had already saved the user
      return id;
    },
  };
  return { api, users, created };
}

test('success: creates one external user with every required field', async () => {
  const org = fakeOrg();
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'provisioned');
  assert.equal(outcome.sfUserId, '005CUST00000001AA');
  assert.equal(org.created.length, 1);
  assert.deepEqual(org.created[0], {
    ContactId: customer.contactId,
    ProfileId: settings.profileId,
    Username: 'taylor@example.com.maidbright.demo',
    Email: 'taylor@example.com',
    FirstName: 'Taylor',
    LastName: 'Brooks',
    Alias: 'tbrooks',
    CommunityNickname: 'taylorbrooks.123abc',
    TimeZoneSidKey: 'America/Chicago',
    LocaleSidKey: 'en_US',
    EmailEncodingKey: 'UTF-8',
    LanguageLocaleKey: 'en_US',
  });
  assert.ok(!('Password' in org.created[0]!), 'no password is ever sent');
});

test('existing user for the Contact is reused and no second user is created', async () => {
  const org = fakeOrg();
  org.users.set(customer.contactId, { Id: '005EXISTING0000AAA', IsActive: true });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.deepEqual(outcome, { status: 'provisioned', sfUserId: '005EXISTING0000AAA' });
  assert.equal(org.created.length, 0);
});

test('an inactive existing user is linked but not reactivated (reactivation would use a licence)', async () => {
  const org = fakeOrg();
  org.users.set(customer.contactId, { Id: '005INACTIVE0000AAA', IsActive: false });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'blocked');
  assert.equal(outcome.sfUserId, '005INACTIVE0000AAA');
  assert.match(outcome.error!, /^USER_INACTIVE/);
  assert.equal(org.created.length, 0);
});

test('timeout: reported as a temporary failure, and the retry adopts the user the lost request created', async () => {
  const org = fakeOrg({ failures: [timeout()], createdPersists: true });
  const first = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(first.status, 'failed');
  assert.match(first.error!, /^TIMEOUT/);
  assert.equal(org.created.length, 1, 'Salesforce saved the user even though the response was lost');

  const retry = await provisionCustomerUser(customer, org.api, settings);
  assert.deepEqual(retry, { status: 'provisioned', sfUserId: '005CUST00000001AA' });
  assert.equal(org.created.length, 1, 'no duplicate user on retry');
});

test('timeout before Salesforce saved anything: the retry creates the user once', async () => {
  const org = fakeOrg({ failures: [timeout()] });
  assert.equal((await provisionCustomerUser(customer, org.api, settings)).status, 'failed');
  assert.equal(org.created.length, 0);
  assert.equal((await provisionCustomerUser(customer, org.api, settings)).status, 'provisioned');
  assert.equal(org.created.length, 1);
});

test('licence exhaustion is blocked (needs a Salesforce fix), not retried quickly', async () => {
  const org = fakeOrg({ failures: [sfError('LICENSE_LIMIT_EXCEEDED', 'License Limit Exceeded')] });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.error!, /^LICENSE_LIMIT_EXCEEDED/);
  assert.equal(nextAttemptDelayMs('blocked', 1), 6 * 60 * 60 * 1000);
});

test('missing Account-owner role is blocked with a clear code', async () => {
  const org = fakeOrg({ failures: [sfError('UNKNOWN_EXCEPTION', 'portal account owner must have a role')] });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.error!, /^ACCOUNT_OWNER_ROLE_MISSING/);
});

test('duplicate username falls back to the Contact-based username, then blocks if that is taken too', async () => {
  const org = fakeOrg({ failures: [sfError('DUPLICATE_USERNAME', 'Duplicate Username')] });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'provisioned');
  assert.equal(org.created[0]!.Username, '003000000000123abc@maidbright.demo');

  const taken = fakeOrg({ failures: [sfError('DUPLICATE_USERNAME', 'dup'), sfError('DUPLICATE_USERNAME', 'dup')] });
  const blocked = await provisionCustomerUser(customer, taken.api, settings);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.error!, /^DUPLICATE_USERNAME/);
});

test('duplicate nickname uses the fallback nickname', async () => {
  const org = fakeOrg({ failures: [sfError('DUPLICATE_COMMUNITY_NICKNAME', 'dup nickname')] });
  assert.equal((await provisionCustomerUser(customer, org.api, settings)).status, 'provisioned');
  assert.equal(org.created[0]!.CommunityNickname, 'mb.003000000000123abc');
});

test('an internal (Standard) profile is refused: never silently creates an internal user', async () => {
  const org = fakeOrg({ userType: 'Standard' });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.error!, /^PROFILE_NOT_EXTERNAL/);
  assert.equal(org.created.length, 0);
});

test('unknown profile and missing configuration are blocked without creating anything', async () => {
  const missing = fakeOrg({ userType: undefined });
  assert.match((await provisionCustomerUser(customer, missing.api, settings)).error!, /^PROFILE_NOT_FOUND/);
  const unconfigured = fakeOrg();
  const outcome = await provisionCustomerUser(customer, unconfigured.api, { ...settings, profileId: undefined });
  assert.equal(outcome.status, 'blocked');
  assert.match(outcome.error!, /^NOT_CONFIGURED/);
  assert.equal(unconfigured.created.length, 0);
});

test('Salesforce connection loss is a temporary failure with backoff', async () => {
  const org = fakeOrg({
    failures: [Object.assign(new Error('Maid Bright is temporarily unavailable.'), { code: 'INTEGRATION_NOT_CONNECTED' })],
  });
  const outcome = await provisionCustomerUser(customer, org.api, settings);
  assert.equal(outcome.status, 'failed');
  assert.deepEqual([1, 2, 3, 4, 5, 9].map((n) => nextAttemptDelayMs('failed', n)! / 60000), [1, 5, 15, 60, 240, 240]);
  assert.equal(nextAttemptDelayMs('provisioned', 1), null);
});

test('alias is at most 8 characters and never empty', () => {
  assert.equal(aliasFor('Taylor', 'Brooks-Montgomery'), 'tbrooksm');
  assert.equal(aliasFor('', ''), 'mbcust');
});
