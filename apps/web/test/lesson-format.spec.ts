import { describe, expect, it } from 'vitest';

import {
  excerptScoreText,
  formatBytes,
  formatClock,
  formatDuration,
  formatElapsed,
  formatParticipants,
} from '@/components/lessons/format';
import { formatRelativeDate } from '@/lib/relative-time';

/**
 * The case table shared with mobile's `lesson_format_test.dart` (and F12's
 * `formats_each_band_against_server_time`): every row must print the same
 * text on both clients.
 */
const NOW = new Date('2026-09-25T15:00:00.000Z');

describe('lesson formatters', () => {
  it('relative_dates', () => {
    const cases: Array<[string, string]> = [
      ['2026-09-25T14:59:30.000Z', 'Just now'],
      ['2026-09-25T14:59:00.000Z', '1 minute ago'],
      ['2026-09-25T14:55:00.000Z', '5 minutes ago'],
      ['2026-09-25T12:00:00.000Z', '3 hours ago'],
      ['2026-09-24T20:00:00.000Z', 'Yesterday'],
      ['2026-09-22T10:00:00.000Z', '3 days ago'],
      ['2026-09-18T10:00:00.000Z', '18 Sep'],
      ['2025-03-12T10:00:00.000Z', '12 Mar 2025'],
      // A clock slightly ahead of the viewer's never reads as the future.
      ['2026-09-25T15:00:20.000Z', 'Just now'],
    ];
    for (const [iso, text] of cases) {
      expect(formatRelativeDate(iso, NOW, 'UTC'), iso).toBe(text);
    }
  });

  it('calendar_days_are_the_viewers', () => {
    // 09:00 and 23:00 of the same São Paulo day, though UTC puts them on two different days.
    const now = new Date('2026-09-25T02:00:00.000Z');
    expect(formatRelativeDate('2026-09-24T12:00:00.000Z', now, 'America/Sao_Paulo')).toBe('14 hours ago');
    expect(formatRelativeDate('2026-09-24T12:00:00.000Z', now, 'UTC')).toBe('Yesterday');
  });

  it('durations_clocks_elapsed_and_sizes', () => {
    expect(formatDuration(42 * 60)).toBe('42 min');
    expect(formatDuration(3_900)).toBe('1 h 05 min');
    expect(formatDuration(95)).toBe('2 min');
    expect(formatDuration(null)).toBe('—');
    expect(formatClock(247_000)).toBe('04:07');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatElapsed(64_000)).toBe('1m 04s');
    expect(formatElapsed(45_000)).toBe('45s');
    expect(formatElapsed(7_500_000)).toBe('2h 05m');
    expect(formatBytes(13_002_342)).toBe('12.4 MB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2_048)).toBe('2.0 KB');
  });

  it('participants_and_badge_text', () => {
    expect(
      formatParticipants([
        { displayName: 'Ana', isMe: false },
        { displayName: 'Miguel', isMe: true },
        { displayName: 'Bruno', isMe: false },
      ]),
    ).toBe('You, Ana, Bruno');
    expect(excerptScoreText({ status: 'assessed', scores: { pronunciation: 71.5, accuracy: 1, fluency: 1, prosody: null, completeness: 1 } })).toBe('72');
    expect(excerptScoreText({ status: 'pending', scores: null })).toBe('Pending');
    expect(excerptScoreText({ status: 'not_assessed', scores: null })).toBe('Not assessed');
  });
});
