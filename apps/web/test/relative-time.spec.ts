import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '@/lib/relative-time';

/**
 * The shared case table: `apps/mobile/test/core/relative_time_test.dart`
 * pins the same rows, so the two clients read every date the same way.
 * Built from local date parts, so it holds in any timezone.
 */
const SERVER_TIME = new Date(2026, 8, 25, 10, 0, 0);

const CASES: Array<[string, Date, string]> = [
  ['thirty seconds ago', new Date(2026, 8, 25, 9, 59, 30), 'Just now'],
  ['a clock slightly ahead', new Date(2026, 8, 25, 10, 5, 0), 'Just now'],
  ['one minute ago', new Date(2026, 8, 25, 9, 59, 0), '1 minute ago'],
  ['forty-five minutes ago', new Date(2026, 8, 25, 9, 15, 0), '45 minutes ago'],
  ['two hours ago', new Date(2026, 8, 25, 8, 0, 0), '2 hours ago'],
  ['early the same day', new Date(2026, 8, 25, 0, 30, 0), '9 hours ago'],
  ['late the previous day', new Date(2026, 8, 24, 23, 30, 0), 'Yesterday'],
  ['two calendar days back', new Date(2026, 8, 23, 18, 0, 0), '2 days ago'],
  ['six calendar days back', new Date(2026, 8, 19, 8, 0, 0), '6 days ago'],
  ['a week back', new Date(2026, 8, 18, 12, 0, 0), '18 Sep'],
  ['earlier this year', new Date(2026, 0, 3, 12, 0, 0), '3 Jan'],
  ['a previous year', new Date(2025, 11, 31, 23, 0, 0), '31 Dec 2025'],
];

describe('relative time', () => {
  it('formats_each_band_against_server_time', () => {
    for (const [name, at, expected] of CASES) {
      expect(formatRelativeTime(at.toISOString(), SERVER_TIME.toISOString()), name).toBe(expected);
    }
  });

  it('minutes_win_over_the_calendar_day_just_after_midnight', () => {
    const justAfterMidnight = new Date(2026, 8, 25, 0, 10, 0);
    expect(formatRelativeTime(new Date(2026, 8, 24, 23, 50, 0), justAfterMidnight)).toBe('20 minutes ago');
  });
});
