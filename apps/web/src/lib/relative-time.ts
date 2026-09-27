/**
 * The one relative-time wording both clients use (F12's ledger, F19's lesson
 * history): `Just now` under a minute, `N minutes ago` under an hour,
 * `N hours ago` on the same calendar day, `Yesterday`, `N days ago` up to
 * six days, then `12 Mar` — with the year only before the current one. The
 * mobile twin is `core/format/relative_time.dart`, pinned by the same case
 * table.
 *
 * Callers pass `reference` as the view's `serverTime` where they have one, so
 * a skewed device clock never shows "in 3 minutes". Calendar days are the
 * viewer's: the time zone defaults to the runtime's, and a test pins it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

function calendarDay(date: Date, timeZone?: string): CalendarDay {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

/** Calendar days between two days; UTC arithmetic keeps a daylight-saving hour out of it. */
function daysBetween(earlier: CalendarDay, later: CalendarDay): number {
  const toUtc = (day: CalendarDay) => Date.UTC(day.year, day.month - 1, day.day);
  return Math.round((toUtc(later) - toUtc(earlier)) / 86_400_000);
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/** `12 Mar`, or `12 Mar 2025` when the year differs from `now`'s. */
export function formatShortDate(date: Date, now: Date = new Date(), timeZone?: string): string {
  const day = calendarDay(date, timeZone);
  const today = calendarDay(now, timeZone);
  const base = `${day.day} ${MONTHS[day.month - 1]}`;
  return day.year === today.year ? base : `${base} ${day.year}`;
}

export function formatRelativeTime(
  value: string | Date,
  reference: string | Date = new Date(),
  timeZone?: string,
): string {
  const at = new Date(value);
  const now = new Date(reference);
  const elapsedMs = now.getTime() - at.getTime();
  if (elapsedMs < 60_000) {
    return 'Just now';
  }
  if (elapsedMs < 3_600_000) {
    return plural(Math.floor(elapsedMs / 60_000), 'minute');
  }
  const days = daysBetween(calendarDay(at, timeZone), calendarDay(now, timeZone));
  if (days <= 0) {
    return plural(Math.floor(elapsedMs / 3_600_000), 'hour');
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days <= 6) {
    return `${days} days ago`;
  }
  return formatShortDate(at, now, timeZone);
}
