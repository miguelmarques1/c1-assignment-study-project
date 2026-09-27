import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '../../src/lessons/lesson-cursor';

describe('lesson cursor', () => {
  it('round_trips_started_at_and_id', () => {
    const cursor = { startedAt: new Date('2026-09-21T19:02:11.000Z'), id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' };
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThanOrEqual(200);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it('rejects_garbage_and_wrong_shapes', () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
    const cases = [
      'not base64!',
      '%%%',
      Buffer.from('not json', 'utf8').toString('base64url'),
      encode([1, 2]),
      encode({ s: '2026-09-21T19:02:11.000Z' }),
      encode({ s: '2026-09-21T19:02:11.000Z', i: 'not-a-uuid' }),
      encode({ s: 'yesterday', i: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }),
      encode(null),
    ];
    for (const text of cases) {
      expect(decodeCursor(text)).toBeNull();
    }
  });
});
