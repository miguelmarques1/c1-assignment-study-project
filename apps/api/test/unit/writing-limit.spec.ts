import { describe, expect, it } from 'vitest';

import { limitState } from '../../src/writing/writing-limit';

const HOUR = 60 * 60 * 1000;

describe('limitState', () => {
  it('counts_requests_in_the_last_24_hours', () => {
    const now = new Date('2026-10-02T12:00:00.000Z');
    const requestedAt = [new Date(now.getTime() - HOUR), new Date(now.getTime() - 2 * HOUR)];
    expect(limitState(requestedAt, now)).toEqual({ max: 10, used: 2, resetsAt: null });
  });

  it('no_reset_time_below_the_limit', () => {
    const now = new Date('2026-10-02T12:00:00.000Z');
    const requestedAt = Array.from({ length: 9 }, (_, i) => new Date(now.getTime() - i * HOUR));
    expect(limitState(requestedAt, now).resetsAt).toBeNull();
  });

  it('resets_24_hours_after_the_oldest_counted_request', () => {
    const now = new Date('2026-10-02T12:00:00.000Z');
    const oldest = new Date(now.getTime() - 23 * HOUR);
    const requestedAt = [oldest, ...Array.from({ length: 9 }, (_, i) => new Date(now.getTime() - i * HOUR))];
    const state = limitState(requestedAt, now);
    expect(state.used).toBe(10);
    expect(state.resetsAt).toBe(new Date(oldest.getTime() + 24 * HOUR).toISOString());
  });
});
