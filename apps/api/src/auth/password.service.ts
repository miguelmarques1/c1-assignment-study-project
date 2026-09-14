import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';

export const BCRYPT_COST = 12;

/**
 * A hash of a value nobody knows, computed once at module load with the same
 * cost factor as a real password. Comparing against it when the email is
 * unknown keeps login's CPU cost constant, which is what stops response timing
 * from revealing whether an account exists.
 */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_COST);

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Burns the same work a real verification would, then reports failure. Call
   * this on the unknown-email path instead of returning early.
   */
  async verifyAgainstDummy(plain: string): Promise<false> {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
}
