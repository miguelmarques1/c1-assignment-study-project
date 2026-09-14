import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { env } from '../config/env';
import { RedisService } from '../redis/redis.service';

export const SESSION_COOKIE = 'eq_session';

export interface SessionRecord {
  userId: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface ResolvedSession extends SessionRecord {
  token: string;
  expiresAt: Date;
}

/**
 * Sessions are opaque tokens backed by Redis rather than self-contained tokens.
 * The PRD requires logout to take effect immediately and a deleted user's
 * session to stop working on the next request; neither is possible without
 * server-side state. Sliding expiry means the store is touched on every
 * request anyway, so there is nothing to gain from a signed stateless token.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly redis: RedisService,
    private readonly ttlSeconds: number = env().SESSION_TTL_SECONDS,
  ) {}

  get ttl(): number {
    return this.ttlSeconds;
  }

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const record: SessionRecord = { userId, createdAt: now, lastSeenAt: now };

    await this.redis.client
      .multi()
      .set(RedisService.sessionKey(token), JSON.stringify(record), 'EX', this.ttlSeconds)
      .sadd(RedisService.userSessionsKey(userId), token)
      .expire(RedisService.userSessionsKey(userId), this.ttlSeconds)
      .exec();

    return { token, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000) };
  }

  /**
   * Reads a session and slides its expiry. Returns null when the token is
   * unknown or has already expired.
   */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const raw = await this.redis.client.get(RedisService.sessionKey(token));
    if (!raw) {
      return null;
    }

    let record: SessionRecord;
    try {
      record = JSON.parse(raw) as SessionRecord;
    } catch {
      await this.revoke(token);
      return null;
    }

    const refreshed: SessionRecord = { ...record, lastSeenAt: new Date().toISOString() };

    await this.redis.client
      .multi()
      .set(RedisService.sessionKey(token), JSON.stringify(refreshed), 'EX', this.ttlSeconds)
      .expire(RedisService.userSessionsKey(record.userId), this.ttlSeconds)
      .exec();

    return {
      ...refreshed,
      token,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
    };
  }

  async revoke(token: string): Promise<void> {
    const raw = await this.redis.client.get(RedisService.sessionKey(token));
    const userId = raw ? (JSON.parse(raw) as SessionRecord).userId : undefined;

    const pipeline = this.redis.client.multi().del(RedisService.sessionKey(token));
    if (userId) {
      pipeline.srem(RedisService.userSessionsKey(userId), token);
    }
    await pipeline.exec();
  }

  /**
   * Used when a password changes and when a user is removed. `exceptToken` lets
   * the caller keep their own session alive while evicting every other device.
   */
  async revokeAllForUser(userId: string, exceptToken?: string): Promise<number> {
    const key = RedisService.userSessionsKey(userId);
    const tokens = await this.redis.client.smembers(key);
    const doomed = tokens.filter((token) => token !== exceptToken);

    if (doomed.length > 0) {
      const pipeline = this.redis.client.multi();
      for (const token of doomed) {
        pipeline.del(RedisService.sessionKey(token));
        pipeline.srem(key, token);
      }
      await pipeline.exec();
    }

    return doomed.length;
  }

  /** Remaining lifetime in seconds, or -2 when the session no longer exists. */
  async ttlOf(token: string): Promise<number> {
    return this.redis.client.ttl(RedisService.sessionKey(token));
  }
}
