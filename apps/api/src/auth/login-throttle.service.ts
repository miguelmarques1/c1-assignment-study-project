import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { RedisService } from '../redis/redis.service';

/**
 * Counts failed logins per email and locks the address once the threshold is
 * crossed. Counters live in Redis so an API restart does not hand an attacker a
 * fresh budget, and emails are hashed so the key space never stores addresses
 * in the clear.
 */
@Injectable()
export class LoginThrottleService {
  constructor(
    private readonly redis: RedisService,
    private readonly maxAttempts: number = env().LOGIN_MAX_ATTEMPTS,
    private readonly lockoutSeconds: number = env().LOGIN_LOCKOUT_SECONDS,
  ) {}

  private static hash(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /**
   * Throws when the email is locked. Called before credentials are checked, so
   * a locked account stays locked even when the password is finally correct.
   */
  async assertNotLocked(email: string): Promise<void> {
    const key = RedisService.loginLockKey(LoginThrottleService.hash(email));
    const ttl = await this.redis.client.ttl(key);

    if (ttl > 0) {
      throw AppError.lockedOut(ttl);
    }
  }

  /** Records a failure and locks the address once the threshold is reached. */
  async recordFailure(email: string): Promise<number> {
    const hashed = LoginThrottleService.hash(email);
    const failKey = RedisService.loginFailKey(hashed);

    const count = await this.redis.client.incr(failKey);
    if (count === 1) {
      await this.redis.client.expire(failKey, this.lockoutSeconds);
    }

    if (count >= this.maxAttempts) {
      await this.redis.client.set(
        RedisService.loginLockKey(hashed),
        '1',
        'EX',
        this.lockoutSeconds,
      );
    }

    return count;
  }

  /** Clears the counter after a successful login. */
  async clear(email: string): Promise<void> {
    const hashed = LoginThrottleService.hash(email);
    await this.redis.client.del(
      RedisService.loginFailKey(hashed),
      RedisService.loginLockKey(hashed),
    );
  }

  async failureCount(email: string): Promise<number> {
    const raw = await this.redis.client.get(
      RedisService.loginFailKey(LoginThrottleService.hash(email)),
    );
    return raw ? Number(raw) : 0;
  }
}
