import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

describe('GET /health', () => {
  it('health_requires_no_session', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health');

    // No cookie was sent, and the route still answered.
    expect([200, 503]).toContain(response.status);
    expect(response.body.data).toBeDefined();
  });

  it('reports_every_dependency_with_latency', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health');

    const names = response.body.data.dependencies.map(
      (entry: { name: string }) => entry.name,
    );
    expect(names.sort()).toEqual(['livekit', 'minio', 'postgres', 'redis']);

    const postgres = response.body.data.dependencies.find(
      (entry: { name: string }) => entry.name === 'postgres',
    );
    expect(postgres.status).toBe('up');
    expect(typeof postgres.latencyMs).toBe('number');
    expect(postgres.error).toBeNull();
  });

  it('returns_503_when_a_dependency_is_down', async () => {
    // MinIO and LiveKit are not started for this suite, so the report is
    // already degraded — which is exactly the case being asserted.
    const response = await request(ctx.app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.data.status).toBe('degraded');

    const minio = response.body.data.dependencies.find(
      (entry: { name: string }) => entry.name === 'minio',
    );
    expect(minio.status).toBe('down');
    expect(minio.latencyMs).toBeNull();
    expect(typeof minio.error).toBe('string');
  });

  it('stopping_redis_marks_it_down_without_hiding_the_others', async () => {
    await ctx.redis.stop();

    const response = await request(ctx.app.getHttpServer()).get('/health');

    const redis = response.body.data.dependencies.find(
      (entry: { name: string }) => entry.name === 'redis',
    );
    const postgres = response.body.data.dependencies.find(
      (entry: { name: string }) => entry.name === 'postgres',
    );

    expect(redis.status).toBe('down');
    expect(postgres.status).toBe('up');
    expect(response.status).toBe(503);
  }, 60_000);
});
