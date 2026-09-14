import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { env } from '../config/env';

/**
 * Owns the single Redis connection and the key helpers everything else builds
 * on. Keeping key construction here means the key space is auditable from one
 * file instead of being spelled out at each call site.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(url: string = env().REDIS_URL) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  /** Cheap liveness probe used by the health endpoint. */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  static sessionKey(token: string): string {
    return `session:${token}`;
  }

  static userSessionsKey(userId: string): string {
    return `user_sessions:${userId}`;
  }

  static loginFailKey(emailHash: string): string {
    return `login_fail:${emailHash}`;
  }

  static loginLockKey(emailHash: string): string {
    return `login_lock:${emailHash}`;
  }
}
