/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DemoAuthService, demoCredentials } from '../src/services/mock/DemoAuthService';
import { MockCustomerApi } from '../src/services/mock/MockCustomerApi';
import { ApiError } from '../src/services/errors';
const digest = async (value: string) => createHash('sha256').update(value).digest('hex');
const form = {
  firstName: 'Taylor',
  lastName: 'Reed',
  email: 'taylor@example.com',
  phone: '5550103030',
  password: 'SamplePass123!',
  confirmPassword: 'SamplePass123!',
};
const code = (name: string) => (error: unknown) => error instanceof ApiError && error.code === name;
test('seed login normalizes email and does not return credential data', async () => {
  const auth = new DemoAuthService(digest, 0);
  const identity = await auth.logIn({ ...demoCredentials, email: ' ALEX.MORGAN@EXAMPLE.COM ' });
  assert.equal(identity.firstName, 'Alex');
  assert.equal(identity.email, demoCredentials.email);
  assert.equal('verifier' in identity, false);
  assert.equal('password' in identity, false);
});
test('wrong password and unknown account have the same friendly error', async () => {
  const auth = new DemoAuthService(digest, 0);
  await assert.rejects(
    auth.logIn({ email: demoCredentials.email, password: 'wrong' }),
    code('INVALID_CREDENTIALS'),
  );
  await assert.rejects(
    auth.logIn({ email: 'unknown@example.com', password: 'wrong' }),
    code('INVALID_CREDENTIALS'),
  );
});
test('signup validates identity, password length and matching confirmation', async () => {
  const auth = new DemoAuthService(digest, 0);
  await assert.rejects(auth.signUp({ ...form, email: 'invalid' }), code('INVALID_SIGNUP'));
  await assert.rejects(auth.signUp({ ...form, phone: '123' }), code('INVALID_SIGNUP'));
  await assert.rejects(
    auth.signUp({ ...form, password: 'short', confirmPassword: 'short' }),
    code('INVALID_PASSWORD'),
  );
  await assert.rejects(
    auth.signUp({ ...form, confirmPassword: 'DoesNotMatch' }),
    code('PASSWORD_MISMATCH'),
  );
});
test('registered account can log back in and returned identities are isolated', async () => {
  const auth = new DemoAuthService(digest, 0);
  const identity = await auth.signUp({ ...form, email: ' TAYLOR@EXAMPLE.COM ' });
  identity.firstName = 'Changed outside service';
  const again = await auth.logIn({ email: form.email, password: form.password });
  assert.equal(again.firstName, 'Taylor');
  assert.equal(again.email, form.email);
});
test('concurrent signup cannot create two accounts with the same normalized email', async () => {
  const auth = new DemoAuthService(digest, 0);
  const result = await Promise.allSettled([
    auth.signUp(form),
    auth.signUp({ ...form, email: 'TAYLOR@EXAMPLE.COM' }),
  ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(
    auth.signUp({ ...form, email: demoCredentials.email }),
    code('EMAIL_EXISTS'),
  );
});
test('signup personalizes customer data, reset preserves identity and logout purges service changes', async () => {
  const auth = new DemoAuthService(digest, 0);
  const api = new MockCustomerApi(0);
  const identity = await auth.signUp(form);
  const data = await api.signIn(identity);
  assert.equal(data.customer.firstName, 'Taylor');
  assert.equal(data.customer.email, form.email);
  await api.sendMessage('My temporary note');
  assert.equal((await api.resetDemo()).customer.id, identity.id);
  await api.signOut();
  const restored = await api.signIn(await auth.logIn(form));
  assert.equal(restored.customer.firstName, 'Taylor');
  assert.equal(restored.messages.length, 3);
  await api.signOut();
  const seeded = await api.signIn(await auth.logIn(demoCredentials));
  assert.equal(seeded.customer.firstName, 'Alex');
});
test('registered accounts do not survive a fresh app runtime', async () => {
  const auth = new DemoAuthService(digest, 0);
  await auth.signUp(form);
  await assert.rejects(new DemoAuthService(digest, 0).logIn(form), code('INVALID_CREDENTIALS'));
});
