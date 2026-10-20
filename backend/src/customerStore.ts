import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'active' | 'disabled';
}

/** The Salesforce records a customer may act as. Server-side only; never sent to or accepted from the app. */
export interface SalesforceLink {
  orgId: string;
  contactId: string;
  accountId: string;
}

export interface CustomerSession {
  customer: Customer;
  salesforce: SalesforceLink;
}

export interface NewCustomer {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string;
  salesforce: SalesforceLink;
  verifiedBySfUserId: string;
}

export class CustomerStoreError extends Error {
  constructor(
    readonly code: 'EMAIL_EXISTS' | 'CONTACT_ALREADY_LINKED',
    message: string,
  ) {
    super(message);
  }
}

export const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

const CUSTOMER_COLUMNS = `c.id, c.email, c.first_name AS firstName, c.last_name AS lastName, c.phone, c.status`;
const LINK_COLUMNS = `l.org_id AS orgId, l.contact_id AS contactId, l.account_id AS accountId`;

type Row = Customer & SalesforceLink;
const split = ({ orgId, contactId, accountId, ...customer }: Row): CustomerSession => ({
  customer,
  salesforce: { orgId, contactId, accountId },
});

export class CustomerStore {
  constructor(private db: DatabaseSync) {}

  create(input: NewCustomer, now = Date.now()): Customer {
    const email = normalizeEmail(input.email);
    if (this.db.prepare('SELECT 1 FROM customers WHERE email = ?').get(email))
      throw new CustomerStoreError('EMAIL_EXISTS', 'A customer with this email already exists.');
    if (
      this.db
        .prepare('SELECT 1 FROM customer_salesforce_links WHERE org_id = ? AND contact_id = ?')
        .get(input.salesforce.orgId, input.salesforce.contactId)
    )
      throw new CustomerStoreError('CONTACT_ALREADY_LINKED', 'This Salesforce Contact already has a customer login.');

    const customer: Customer = {
      id: randomUUID(),
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      status: 'active',
    };
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO customers (id, email, password_hash, first_name, last_name, phone, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(customer.id, email, input.passwordHash, customer.firstName, customer.lastName, customer.phone, now, now);
      this.db
        .prepare(
          `INSERT INTO customer_salesforce_links (customer_id, org_id, contact_id, account_id, verified_at, verified_by_sf_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(customer.id, input.salesforce.orgId, input.salesforce.contactId, input.salesforce.accountId, now, input.verifiedBySfUserId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return customer;
  }

  /** For login only: the one place the password hash leaves the database. */
  findForLogin(email: string): { customer: Customer; passwordHash: string } | undefined {
    const row = this.db
      .prepare(`SELECT ${CUSTOMER_COLUMNS}, c.password_hash AS passwordHash FROM customers c WHERE c.email = ?`)
      .get(normalizeEmail(email)) as (Customer & { passwordHash: string }) | undefined;
    if (!row) return undefined;
    const { passwordHash, ...customer } = row;
    return { customer: { ...customer }, passwordHash };
  }

  list(): CustomerSession[] {
    const rows = this.db
      .prepare(
        `SELECT ${CUSTOMER_COLUMNS}, ${LINK_COLUMNS}
         FROM customers c JOIN customer_salesforce_links l ON l.customer_id = c.id
         ORDER BY c.created_at DESC`,
      )
      .all() as unknown as Row[];
    return rows.map(split);
  }

  /** Creates a session and returns the raw token. Only its hash is stored. */
  createSession(customerId: string, now = Date.now()): string {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare(
        `INSERT INTO customer_sessions (token_hash, customer_id, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(hashToken(token), customerId, now, now, now + SESSION_IDLE_TIMEOUT_MS);
    return token;
  }

  /**
   * Resolves a session token to an active customer and their Salesforce link, and slides the idle expiry.
   * Expired sessions, disabled customers and customers without a verified link all resolve to undefined.
   */
  getSession(token: string, now = Date.now()): CustomerSession | undefined {
    const tokenHash = hashToken(token);
    const row = this.db
      .prepare(
        `SELECT ${CUSTOMER_COLUMNS}, ${LINK_COLUMNS}, s.created_at AS createdAt, s.expires_at AS expiresAt
         FROM customer_sessions s
         JOIN customers c ON c.id = s.customer_id
         JOIN customer_salesforce_links l ON l.customer_id = c.id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as (Row & { createdAt: number; expiresAt: number }) | undefined;
    if (!row) return undefined;
    const { createdAt, expiresAt, ...rest } = row;
    if (expiresAt <= now || now - createdAt >= SESSION_MAX_AGE_MS || rest.status !== 'active') {
      this.deleteSession(token);
      return undefined;
    }
    const nextExpiry = Math.min(now + SESSION_IDLE_TIMEOUT_MS, createdAt + SESSION_MAX_AGE_MS);
    this.db
      .prepare('UPDATE customer_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .run(now, nextExpiry, tokenHash);
    return split(rest);
  }

  deleteSession(token: string) {
    this.db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(hashToken(token));
  }

  purgeExpiredSessions(now = Date.now()) {
    this.db
      .prepare('DELETE FROM customer_sessions WHERE expires_at <= ? OR created_at <= ?')
      .run(now, now - SESSION_MAX_AGE_MS);
  }
}
