import { Injectable } from '@nestjs/common';

import { env } from '../config/env';
import {
  decryptWithKey,
  encryptWithKey,
  parseMasterKey,
  type EncryptedPayload,
} from './credential-crypto';

/**
 * Binds the pure crypto helpers to the configured master key.
 *
 * No constructor parameters: Nest resolves every one of them as a provider, so
 * configuration is read here instead.
 */
@Injectable()
export class CredentialCryptoService {
  private readonly key: Buffer;

  constructor() {
    this.key = parseMasterKey(env().BYOK_MASTER_KEY);
  }

  encrypt(plaintext: string): EncryptedPayload {
    return encryptWithKey(this.key, plaintext);
  }

  decrypt(payload: EncryptedPayload): string {
    return decryptWithKey(this.key, payload);
  }

  /** Non-throwing probe used by the boot check. */
  canDecrypt(payload: EncryptedPayload): boolean {
    try {
      this.decrypt(payload);
      return true;
    } catch {
      return false;
    }
  }
}
