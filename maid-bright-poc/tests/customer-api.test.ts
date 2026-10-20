/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockCustomerApi } from '../src/services/mock/MockCustomerApi';
import { ApiError } from '../src/services/errors';
import { profileForm } from '../src/utils/profile';
const setup = async () => {
  const api = new MockCustomerApi(0);
  await api.signIn();
  return api;
};
const hasCode = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;

test('API requires a session and returned data cannot modify the server', async () => {
  const api = new MockCustomerApi(0);
  await assert.rejects(api.getSnapshot(), hasCode('SESSION_EXPIRED'));
  const data = await api.signIn();
  data.customer.firstName = 'Altered';
  assert.equal((await api.getSnapshot()).customer.firstName, 'Alex');
});
test('reschedule uses a server-issued slot and changes only the requested visit', async () => {
  const api = await setup();
  const slots = await api.getAvailability('apt-1');
  const before = await api.getSnapshot();
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-1', kind: 'reschedule', slotId: 'invented', note: '' }),
    hasCode('SLOT_UNAVAILABLE'),
  );
  const data = await api.submitChange({
    appointmentId: 'apt-1',
    kind: 'reschedule',
    slotId: slots[0].id,
    note: '',
  });
  assert.equal(data.appointments[0].scheduledStart, slots[0].start);
  assert.deepEqual(data.appointments[1], before.appointments[1]);
  assert.equal(data.requests[0].status, 'Approved');
});
test('a slot conflict leaves the appointment unchanged and permits retry', async () => {
  const api = await setup();
  const before = await api.getSnapshot();
  const slots = await api.getAvailability('apt-1');
  api.setOptions({ conflictNextSlot: true });
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-1', kind: 'reschedule', slotId: slots[0].id, note: '' }),
    hasCode('SLOT_UNAVAILABLE'),
  );
  assert.deepEqual((await api.getSnapshot()).appointments, before.appointments);
  assert.equal(api.options.conflictNextSlot, false);
  assert.equal(
    (
      await api.submitChange({
        appointmentId: 'apt-1',
        kind: 'reschedule',
        slotId: slots[1].id,
        note: '',
      })
    ).requests[0].status,
    'Approved',
  );
});
test('review requests do not change visits, block another request, and apply on approval', async () => {
  const api = await setup();
  api.setOptions({ requireReview: true });
  const before = await api.getSnapshot();
  const slots = await api.getAvailability('apt-1');
  const data = await api.submitChange({
    appointmentId: 'apt-1',
    kind: 'reschedule',
    slotId: slots[0].id,
    note: 'Please move my visit',
  });
  assert.equal(data.requests[0].status, 'Pending review');
  assert.deepEqual(data.appointments, before.appointments);
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-1', kind: 'skip', note: '' }),
    hasCode('REQUEST_PENDING'),
  );
  const approved = await api.resolveDemoRequest(data.requests[0].id, true);
  assert.equal(approved.requests[0].status, 'Approved');
  assert.equal(approved.appointments[0].scheduledStart, slots[0].start);
});
test('skip disables future actions on that visit and preserves the next visit', async () => {
  const api = await setup();
  const before = await api.getSnapshot();
  const data = await api.submitChange({
    appointmentId: 'apt-1',
    kind: 'skip',
    note: 'Away this week',
  });
  assert.equal(data.appointments[0].status, 'Skipped');
  assert.deepEqual(data.appointments[1], before.appointments[1]);
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-1', kind: 'skip', note: '' }),
    hasCode('ACTION_UNAVAILABLE'),
  );
});
test('cancellation checks reason and permissions and keeps visit on decline', async () => {
  const api = await setup();
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-3', kind: 'cancel', note: 'Away' }),
    hasCode('ACTION_UNAVAILABLE'),
  );
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-1', kind: 'cancel', note: '' }),
    hasCode('REASON_REQUIRED'),
  );
  const pending = await api.submitChange({
    appointmentId: 'apt-1',
    kind: 'cancel',
    note: 'Travel',
  });
  assert.equal(pending.appointments[0].status, 'Confirmed');
  const declined = await api.resolveDemoRequest(pending.requests[0].id, false);
  assert.equal(declined.appointments[0].status, 'Confirmed');
  assert.equal(declined.requests[0].status, 'Declined');
});
test('additional services require catalog IDs and approval before being added', async () => {
  const api = await setup();
  await assert.rejects(
    api.submitChange({
      appointmentId: 'apt-1',
      kind: 'add-service',
      serviceIds: ['invalid'],
      note: '',
    }),
    hasCode('INVALID_SERVICE'),
  );
  const pending = await api.submitChange({
    appointmentId: 'apt-1',
    kind: 'add-service',
    serviceIds: ['svc-carpet'],
    note: '',
  });
  assert.equal(pending.appointments[0].addons.length, 0);
  const approved = await api.resolveDemoRequest(pending.requests[0].id, true);
  assert.deepEqual(approved.appointments[0].addons, ['svc-carpet']);
  await assert.rejects(
    api.submitChange({
      appointmentId: 'apt-1',
      kind: 'add-service',
      serviceIds: ['svc-carpet'],
      note: '',
    }),
    hasCode('INVALID_SERVICE'),
  );
});
test('payment failure has no side effects and duplicate/concurrent payments are blocked', async () => {
  const api = await setup();
  api.setOptions({ failNextPayment: true });
  await assert.rejects(api.payInvoice('inv-1'), hasCode('PAYMENT_FAILED'));
  assert.equal((await api.getSnapshot()).invoices[0].status, 'Due');
  const results = await Promise.allSettled([api.payInvoice('inv-1'), api.payInvoice('inv-1')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const data = await api.getSnapshot();
  assert.equal(data.invoices[0].status, 'Paid');
  assert.equal(data.payments.filter((p) => p.invoiceId === 'inv-1').length, 1);
  assert.equal(data.credits, 25);
  assert.equal(data.savedMethod.last4, '4242');
});
test('offline mutations fail without losing the server snapshot', async () => {
  const api = await setup();
  const before = await api.getSnapshot();
  api.setOptions({ offline: true });
  await assert.rejects(
    api.submitChange({ appointmentId: 'apt-1', kind: 'skip', note: '' }),
    hasCode('OFFLINE'),
  );
  await assert.rejects(api.payInvoice('inv-1'), hasCode('OFFLINE'));
  await assert.rejects(api.sendMessage('Hello'), hasCode('OFFLINE'));
  api.setOptions({ offline: false });
  assert.deepEqual(await api.getSnapshot(), before);
});
test('profile edits propagate only to upcoming visits, preferences and replies update', async () => {
  const api = await setup();
  const before = await api.getSnapshot();
  const form = profileForm(before.customer);
  form.address.line1 = '99 Demo Street';
  form.accessInstructions = 'Ring twice';
  const data = await api.updateProfile(form);
  assert.equal(data.customer.accessInstructions, 'Ring twice');
  assert.equal(data.appointments[0].address.line1, '99 Demo Street');
  assert.equal(data.appointments[3].address.line1, before.appointments[3].address.line1);
  await assert.rejects(
    api.updateProfile({ ...form, email: 'invalid' }),
    hasCode('INVALID_PROFILE'),
  );
  const prefs = await api.updatePreferences({ ...data.preferences, sms: false });
  assert.equal(prefs.preferences.sms, false);
  const message = await api.sendMessage('  Please focus on the kitchen  ');
  assert.equal(message.messages.at(-1)?.body, 'Please focus on the kitchen');
});
test('logout clears demo edits and an in-flight operation cannot restore them', async () => {
  const api = await setup();
  await api.sendMessage('Temporary message');
  const pending = api.getSnapshot();
  await api.signOut();
  await assert.rejects(pending, hasCode('SESSION_EXPIRED'));
  const data = await api.signIn();
  assert.equal(data.messages.length, 3);
  assert.equal(data.requests.length, 0);
  assert.equal(data.invoices[0].status, 'Due');
});
