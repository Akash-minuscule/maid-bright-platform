import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Local SQLite store for the POC (customer logins only; Salesforce stays the system of record).
 * Each entry runs once, in order; PRAGMA user_version records how many have been applied.
 */
const MIGRATIONS = [
  `
  CREATE TABLE customers (
    id            TEXT PRIMARY KEY,              -- our own random ID, never a Salesforce ID
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,                 -- scrypt$N$r$p$salt$hash, never plaintext
    first_name    TEXT NOT NULL,
    last_name     TEXT NOT NULL,
    phone         TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  -- Which Salesforce Contact/Account a customer may act as. Written only by the admin
  -- provisioning flow after the IDs were read back from Salesforce; never from app input.
  CREATE TABLE customer_salesforce_links (
    customer_id            TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    org_id                 TEXT NOT NULL,
    contact_id             TEXT NOT NULL,
    account_id             TEXT NOT NULL,
    verified_at            INTEGER NOT NULL,
    verified_by_sf_user_id TEXT NOT NULL,
    UNIQUE (org_id, contact_id)
  );

  -- Only a SHA-256 of each session token is stored, so a leaked database cannot be replayed as cookies.
  CREATE TABLE customer_sessions (
    token_hash   TEXT PRIMARY KEY,
    customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL
  );
  CREATE INDEX customer_sessions_customer ON customer_sessions(customer_id);
  CREATE INDEX customer_sessions_expiry ON customer_sessions(expires_at);
  `,
  `
  -- The backend's own Salesforce connection (one row). The refresh token is AES-256-GCM encrypted.
  CREATE TABLE integration_connection (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    sf_user_id        TEXT NOT NULL,
    org_id            TEXT NOT NULL,
    instance_url      TEXT NOT NULL,
    identity_url      TEXT NOT NULL,
    scope             TEXT,
    refresh_token_enc TEXT NOT NULL,
    connected_at      INTEGER NOT NULL
  );

  -- Email one-time codes for first-time password setup and new registrations. Only a hash of the code is kept.
  CREATE TABLE email_verifications (
    id            TEXT PRIMARY KEY,   -- random; the app holds it while the customer finishes the flow
    purpose       TEXT NOT NULL CHECK (purpose IN ('activation', 'registration')),
    email         TEXT NOT NULL,
    code_hash     TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    sends         INTEGER NOT NULL DEFAULT 1,
    last_sent_at  INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    verified_at   INTEGER,
    outcome       TEXT,               -- result of the Salesforce check, decided only after the code is verified
    contact_json  TEXT,               -- activation: the single matching Contact; registration: the entered details
    claimed_at    INTEGER,            -- set while completion runs, so a double submit cannot run twice
    completed_at  INTEGER,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX email_verifications_email ON email_verifications(email, created_at);
  `,
];

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const { user_version: applied } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = applied; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
