import { db } from './appDb.js';
import { config } from './config.js';
import { salesforceUserApi } from './salesforceCustomers.js';
import { nextAttemptDelayMs, provisionCustomerUser, type ProvisioningOutcome } from './userProvisioning.js';

/**
 * Runs Salesforce external Customer User provisioning in the background and records the result on the
 * customer's Salesforce mapping. Never part of a login or sign-up response, so a failure can't lock a customer out.
 */

interface Row {
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  contactId: string;
  attempts: number;
}

const SELECT = `SELECT c.id AS customerId, c.email, c.first_name AS firstName, c.last_name AS lastName,
  l.user_status AS status, l.contact_id AS contactId, l.user_attempts AS attempts
  FROM customer_salesforce_links l JOIN customers c ON c.id = l.customer_id`;

const running = new Set<string>();

function record(customerId: string, attempts: number, outcome: ProvisioningOutcome, now = Date.now()) {
  const delay = nextAttemptDelayMs(outcome.status, attempts);
  db.prepare(
    `UPDATE customer_salesforce_links
     SET user_status = ?, sf_user_id = COALESCE(?, sf_user_id), user_error = ?, user_attempts = ?,
         user_next_attempt_at = ?, user_updated_at = ?
     WHERE customer_id = ?`,
  ).run(outcome.status, outcome.sfUserId ?? null, outcome.error ?? null, attempts, delay === null ? null : now + delay, now, customerId);
}

export async function provisionNow(customerId: string): Promise<void> {
  if (running.has(customerId)) return; // one attempt per customer at a time
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(customerId) as Row | undefined;
  if (!row || row.status === 'provisioned') return;
  running.add(customerId);
  try {
    const attempts = row.attempts + 1;
    let outcome: ProvisioningOutcome;
    try {
      outcome = await provisionCustomerUser(row, salesforceUserApi, config.customerUser);
    } catch (error) {
      outcome = { status: 'failed', error: `UNEXPECTED: ${(error as Error).message}`.slice(0, 300) };
    }
    try {
      record(customerId, attempts, outcome);
    } catch (error) {
      // e.g. the unique index: this Salesforce User is already linked to another Maid Bright customer.
      record(customerId, attempts, { status: 'blocked', error: `LINK_CONFLICT: ${(error as Error).message}`.slice(0, 300) });
    }
    const code = outcome.error?.split(':')[0];
    if (outcome.status === 'provisioned') console.info(`[users] customer ${customerId} linked to Salesforce User ${outcome.sfUserId}`);
    else console.warn(`[users] customer ${customerId} user provisioning ${outcome.status} (${code}), attempt ${attempts}`);
  } finally {
    running.delete(customerId);
  }
}

/** Fire and forget: used right after sign-up or password setup. */
export function scheduleUserProvisioning(customerId: string) {
  setImmediate(() => void provisionNow(customerId).catch((e) => console.error('[users] provisioning crashed', (e as Error).message)));
}

async function sweep() {
  const due = db
    .prepare(
      `${SELECT} WHERE l.user_status IN ('pending', 'failed', 'blocked')
       AND (l.user_next_attempt_at IS NULL OR l.user_next_attempt_at <= ?) ORDER BY l.user_updated_at LIMIT 10`,
    )
    .all(Date.now()) as unknown as Row[];
  for (const row of due) await provisionNow(row.customerId);
}

/**
 * Retries pending, failed and blocked customers in the background. A restart is when Salesforce or .env fixes
 * usually take effect, so every unprovisioned customer becomes due again at startup.
 */
export function startUserProvisioningWorker() {
  db.prepare(`UPDATE customer_salesforce_links SET user_next_attempt_at = NULL WHERE user_status != 'provisioned'`).run();
  const run = () => void sweep().catch((e) => console.error('[users] sweep failed', (e as Error).message));
  setTimeout(run, 5_000).unref();
  setInterval(run, 60_000).unref();
}
