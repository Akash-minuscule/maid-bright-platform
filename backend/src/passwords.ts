import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP minimum for scrypt: N=2^17, r=8, p=1 (~128 MiB per hash). Parameters are stored with each hash
// so they can be raised later without breaking existing passwords.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;
/** A real hash to check unknown emails against, so "no such account" takes as long as "wrong password". */
export const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(32).toString('base64')));
