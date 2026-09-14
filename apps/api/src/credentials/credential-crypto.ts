import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Pure AES-256-GCM helpers, deliberately free of Nest and of configuration.
 *
 * Keeping the primitives as functions that take an explicit key means the unit
 * tests can exercise two different master keys in the same process, which is the
 * only way to prove that a credential is actually bound to the key that wrote it.
 */

export const ALGORITHM = 'aes-256-gcm';
export const KEY_BYTES = 32;
export const IV_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export class InvalidMasterKeyError extends Error {
  constructor(actualBytes: number) {
    super(`BYOK_MASTER_KEY must decode to ${KEY_BYTES} bytes; got ${actualBytes}.`);
    this.name = 'InvalidMasterKeyError';
  }
}

export function parseMasterKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new InvalidMasterKeyError(key.length);
  }
  return key;
}

export function encryptWithKey(key: Buffer, plaintext: string): EncryptedPayload {
  // A fresh IV per write: reusing one under the same key is what breaks GCM.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/**
 * Throws when the key is wrong or either the ciphertext or the tag was altered.
 * GCM authenticates before it returns, so a tampered payload fails loudly rather
 * than decrypting into plausible garbage.
 */
export function decryptWithKey(key: Buffer, payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv);
  decipher.setAuthTag(payload.authTag);

  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]).toString('utf8');
}

/** Last four characters, for display. Short values are masked entirely. */
export function lastFourOf(secret: string): string {
  return secret.length <= 4 ? '****' : secret.slice(-4);
}
