const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days between two instants in the viewer's timezone; rounding absorbs a daylight-saving hour. */
function calendarDaysBetween(earlier: Date, later: Date): number {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

/**
 * The one relative-time wording both clients use (F12, shared with F19):
 * `Just now`, `N minutes ago`, `N hours ago` on the same calendar day,
 * `Yesterday`, `N days ago` up to six days, then `12 Mar` — with the year
 * only before the current one. Formatted in the viewer's timezone against
 * `reference`, which callers pass as the view's `serverTime` so a skewed
 * device clock never shows "in 3 minutes". The mobile twin is
 * `core/format/relative_time.dart`, pinned by the same case table.
 */
export function formatRelativeTime(value: string | Date, reference: string | Date = new Date()): string {
  const at = new Date(value);
  const now = new Date(reference);
  const seconds = (now.getTime() - at.getTime()) / 1000;

  if (seconds < 60) {
    return 'Just now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return plural(minutes, 'minute');
  }
  const days = calendarDaysBetween(at, now);
  if (days <= 0) {
    return plural(Math.floor(minutes / 60), 'hour');
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days <= 6) {
    return `${days} days ago`;
  }
  const date = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  return at.getFullYear() === now.getFullYear() ? date : `${date} ${at.getFullYear()}`;
}
