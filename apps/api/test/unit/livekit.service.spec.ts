import { beforeEach, describe, expect, it } from 'vitest';

import { resetEnvCache } from '../../src/config/env';
import { LiveKitService } from '../../src/classroom/livekit.service';
import { AppError } from '../../src/common/app-error';
import { TEST_MASTER_KEY, TEST_SESSION_SECRET } from '../integration/helpers/test-app';

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: TEST_SESSION_SECRET,
  BYOK_MASTER_KEY: TEST_MASTER_KEY,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  S3_BUCKET: 'english-quest',
  LIVEKIT_URL: 'http://localhost:7880',
  LIVEKIT_WS_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'devsecret',
} as NodeJS.ProcessEnv;

/** LiveKit JWTs carry standard claims (`sub`, `exp`, `iat`) plus a top-level `video` grant — no library needed to read them back. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('LiveKitService', () => {
  beforeEach(() => {
    Object.assign(process.env, VALID_ENV);
    resetEnvCache();
  });

  it('issues_a_token_with_room_join_publish_and_subscribe_grants', async () => {
    const service = new LiveKitService();
    const { token } = await service.issueAccessToken({
      identity: 'user-1',
      name: 'Miguel',
      room: 'classroom-main',
    });

    const payload = decodeJwtPayload(token);
    const video = payload.video as Record<string, unknown>;

    expect(payload.sub).toBe('user-1');
    expect(video.roomJoin).toBe(true);
    expect(video.room).toBe('classroom-main');
    expect(video.canPublish).toBe(true);
    expect(video.canSubscribe).toBe(true);
  });

  it('issues_a_token_with_a_6_hour_ttl', async () => {
    const service = new LiveKitService();
    const { token } = await service.issueAccessToken({
      identity: 'user-1',
      name: 'Miguel',
      room: 'classroom-main',
    });

    // The SDK sets `nbf` (not `iat`, which it never sets) to the issuance
    // instant, and `exp` as ttl seconds after it.
    const payload = decodeJwtPayload(token);
    expect((payload.exp as number) - (payload.nbf as number)).toBe(21_600);
  });

  it('carries_the_display_name', async () => {
    const service = new LiveKitService();
    const { token } = await service.issueAccessToken({
      identity: 'user-1',
      name: 'Ana Beatriz',
      room: 'classroom-main',
    });

    const payload = decodeJwtPayload(token);
    expect(payload.name).toBe('Ana Beatriz');
  });

  it('translates_a_transport_failure_into_class002', async () => {
    // Nothing listens on this port — a real connection failure, not a mock.
    Object.assign(process.env, { LIVEKIT_URL: 'http://127.0.0.1:1' });
    resetEnvCache();

    const service = new LiveKitService();

    try {
      await service.listParticipants('classroom-main');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('CLASS002');
      expect(appError.details).toEqual({ reason: 'LiveKit server not reachable' });
      // The raw SDK/transport error text (host, port, ECONNREFUSED, ...) must
      // never leak into the response the client reads.
      expect(JSON.stringify(appError.details)).not.toContain('127.0.0.1');
    }
  });
});
