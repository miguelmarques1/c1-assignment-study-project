import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  decryptWithKey,
  encryptWithKey,
  InvalidMasterKeyError,
  lastFourOf,
  parseMasterKey,
  KEY_BYTES,
  IV_BYTES,
} from '../../src/credentials/credential-crypto';

const KEY = randomBytes(KEY_BYTES);
const OTHER_KEY = randomBytes(KEY_BYTES);
const SECRET = 'AIzaSyD-example-gemini-key-value-f4Qa';

describe('credential crypto', () => {
  it('round_trips_a_key', () => {
    const payload = encryptWithKey(KEY, SECRET);
    expect(decryptWithKey(KEY, payload)).toBe(SECRET);
  });

  it('never_stores_the_plaintext_in_the_payload', () => {
    const payload = encryptWithKey(KEY, SECRET);
    const joined = Buffer.concat([payload.ciphertext, payload.iv, payload.authTag]).toString(
      'latin1',
    );
    expect(joined).not.toContain(SECRET);
  });

  it('produces_a_unique_iv_per_write', () => {
    const first = encryptWithKey(KEY, SECRET);
    const second = encryptWithKey(KEY, SECRET);

    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(first.iv).toHaveLength(IV_BYTES);
  });

  it('rejects_a_tampered_ciphertext', () => {
    const payload = encryptWithKey(KEY, SECRET);
    const tampered = Buffer.from(payload.ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;

    // GCM authenticates before returning, so this throws rather than decrypting
    // into plausible-looking garbage.
    expect(() => decryptWithKey(KEY, { ...payload, ciphertext: tampered })).toThrow();
  });

  it('rejects_a_tampered_auth_tag', () => {
    const payload = encryptWithKey(KEY, SECRET);
    const tampered = Buffer.from(payload.authTag);
    tampered[0] = tampered[0]! ^ 0xff;

    expect(() => decryptWithKey(KEY, { ...payload, authTag: tampered })).toThrow();
  });

  it('fails_with_a_different_master_key', () => {
    const payload = encryptWithKey(KEY, SECRET);
    expect(() => decryptWithKey(OTHER_KEY, payload)).toThrow();
  });

  it('parses_a_valid_master_key', () => {
    const base64 = randomBytes(KEY_BYTES).toString('base64');
    expect(parseMasterKey(base64)).toHaveLength(KEY_BYTES);
  });

  it('rejects_a_master_key_of_the_wrong_length', () => {
    const short = randomBytes(16).toString('base64');
    expect(() => parseMasterKey(short)).toThrow(InvalidMasterKeyError);
  });

  it('masks_all_but_the_last_four_characters', () => {
    expect(lastFourOf(SECRET)).toBe('f4Qa');
    expect(lastFourOf('abc')).toBe('****');
  });
});
