import type { ExcerptPronunciation } from '@english-quest/shared';

import { formatShortDate } from '@/lib/relative-time';

/**
 * F19's display formatters (A19). Mobile's `lesson_format.dart` follows the
 * same rules and the same case table, so both clients print identical text.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A lesson's length: `42 min`, `1 h 05 min`. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const minutes = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
}

/** A transcript margin: `04:07`, or `1:02:03` past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** A stage's elapsed or completed time: `45s`, `1m 04s`, `2h 05m`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  if (total < 3600) {
    return `${Math.floor(total / 60)}m ${pad(total % 60)}s`;
  }
  return `${Math.floor(total / 3600)}h ${pad(Math.floor((total % 3600) / 60))}m`;
}

/** Storage: `12.4 MB`, 1024-based with one decimal. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** A time of day: `14:32`. */
export function formatTimeOfDay(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );
}

/** The header's absolute date: `24 Sep 2026, 14:10`. */
export function formatAbsoluteDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  // A far-future "now" forces the year onto the short date.
  return `${formatShortDate(date, new Date(Date.UTC(9999, 0, 1)), timeZone)}, ${formatTimeOfDay(iso, timeZone)}`;
}

/** `You, Ana` — the caller first, then everyone else in join order. */
export function formatParticipants(participants: Array<{ displayName: string; isMe: boolean }>): string {
  const others = participants.filter((participant) => !participant.isMe).map((participant) => participant.displayName);
  return (participants.some((participant) => participant.isMe) ? ['You', ...others] : others).join(', ');
}

/**
 * The text an excerpt's score badge carries — the same helper for the
 * transcript badge and the pronunciation section's list, so the two can
 * never disagree about the number shown.
 */
export function excerptScoreText(pronunciation: ExcerptPronunciation): string {
  if (pronunciation.status === 'assessed' && pronunciation.scores) {
    return String(Math.round(pronunciation.scores.pronunciation));
  }
  return pronunciation.status === 'pending' ? 'Pending' : 'Not assessed';
}

/** `grammar` → `Grammar`. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
