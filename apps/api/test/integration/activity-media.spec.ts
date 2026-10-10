import { Logger } from '@nestjs/common';
import type { Test } from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { StorageUnavailableError } from '../../src/storage/storage.service';
import { makeWav } from './helpers/content-fixtures';
import {
  api,
  createActivityTestContext,
  resetActivityTables,
  seedItem,
  seedPlan,
  type ActivityTestContext,
} from './helpers/activity-fixtures';
import { seedLesson, seedSpeaker } from './helpers/pipeline-fixtures';

let env: ActivityTestContext;
const AUDIO = makeWav(3);

beforeAll(async () => {
  env = await createActivityTestContext();
}, 240_000);

afterAll(async () => {
  await env?.close();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetActivityTables(env.ctx);
});

/** Collects the response body as bytes instead of letting supertest guess a parser. */
function binary(call: Test): Test {
  return call.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

async function listening(name: string, options: { upload?: boolean } = {}) {
  const speaker = await seedSpeaker(env.ctx, name, { withKey: false });
  const lessonId = await seedLesson(env.ctx, [speaker.id], new Date());
  const item = await seedItem(env.ctx, `listening-${name.toLowerCase()}`, { type: 'listening', mediaBytes: AUDIO.length });
  if (options.upload !== false) {
    await env.storage.putObject(item.mediaObjectKey!, AUDIO, 'audio/wav');
  }
  const plan = await seedPlan(env.ctx, speaker.id, lessonId, [{ kind: 'listening', contentItemId: item.id }, { kind: 'writing' }]);
  return { speaker, item, id: plan.activityIds[0]!, writingId: plan.activityIds[1]! };
}

describe('activity media', () => {
  it('streams_the_whole_object_with_its_content_type', async () => {
    const a = await listening('Ana');
    const response = await binary(api(env.ctx).get(`/activities/${a.id}/media`, a.speaker)).expect(200);
    expect(response.headers['content-type']).toContain('audio/wav');
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-length']).toBe(String(AUDIO.length));
    expect(response.headers['cache-control']).toBe('private, max-age=3600');
    expect(Buffer.compare(response.body as Buffer, AUDIO)).toBe(0);
  });

  it('serves_a_byte_range_with_206_and_content_range', async () => {
    const a = await listening('Bea');
    const response = await binary(api(env.ctx).get(`/activities/${a.id}/media`, a.speaker).set('Range', 'bytes=10-109')).expect(206);
    expect(response.headers['content-range']).toBe(`bytes 10-109/${AUDIO.length}`);
    expect(response.headers['content-length']).toBe('100');
    expect(Buffer.compare(response.body as Buffer, AUDIO.subarray(10, 110))).toBe(0);
  });

  it('an_unsatisfiable_range_returns_the_whole_object', async () => {
    const a = await listening('Cai');
    for (const range of [`bytes=${AUDIO.length + 500}-`, 'bytes=abc', 'bytes=0-1,5-9']) {
      const response = await binary(api(env.ctx).get(`/activities/${a.id}/media`, a.speaker).set('Range', range)).expect(200);
      expect(response.headers['content-range']).toBeUndefined();
      expect(Buffer.compare(response.body as Buffer, AUDIO)).toBe(0);
    }
  });

  it('a_non_listening_activity_has_no_audio', async () => {
    const a = await listening('Dan');
    const response = await api(env.ctx).get(`/activities/${a.writingId}/media`, a.speaker).expect(404);
    expect(response.body.error.code).toBe('ACT004');
  });

  it('a_missing_object_is_act004_and_logged_for_the_curator', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const a = await listening('Eli', { upload: false });
    const response = await api(env.ctx).get(`/activities/${a.id}/media`, a.speaker).expect(404);
    expect(response.body.error.code).toBe('ACT004');
    expect(warn.mock.calls.some((call) => String(call[0]).includes(a.item.slug))).toBe(true);
  });

  it('an_unreachable_store_is_act005', async () => {
    const a = await listening('Fay');
    vi.spyOn(env.storage, 'statObject').mockRejectedValue(new StorageUnavailableError(new Error('connect ECONNREFUSED')));
    const response = await api(env.ctx).get(`/activities/${a.id}/media`, a.speaker).expect(503);
    expect(response.body.error.code).toBe('ACT005');
  });
});
