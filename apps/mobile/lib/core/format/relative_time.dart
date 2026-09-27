const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// Calendar days between two instants in the viewer's timezone. Built from
/// UTC dates of the local calendar parts, so a daylight-saving hour never
/// shifts the count.
int _calendarDaysBetween(DateTime earlier, DateTime later) {
  final from = DateTime.utc(earlier.year, earlier.month, earlier.day);
  final to = DateTime.utc(later.year, later.month, later.day);
  return to.difference(from).inDays;
}

String _ago(int count, String unit) => '$count $unit${count == 1 ? '' : 's'} ago';

/// The one relative-time wording both clients use (F12, shared with F19),
/// the twin of the web's `lib/relative-time.ts` and pinned by the same case
/// table: `Just now`, `N minutes ago`, `N hours ago` on the same calendar
/// day, `Yesterday`, `N days ago` up to six days, then `12 Mar` — with the
/// year only before the current one. [reference] is the view's `serverTime`
/// when it carries one, so a skewed device clock never shows the future.
String formatRelativeTime(DateTime value, {DateTime? reference}) {
  final at = value.toLocal();
  final now = (reference ?? DateTime.now()).toLocal();
  final seconds = now.difference(at).inMilliseconds / 1000;

  if (seconds < 60) return 'Just now';
  final minutes = seconds ~/ 60;
  if (minutes < 60) return _ago(minutes, 'minute');
  final days = _calendarDaysBetween(at, now);
  if (days <= 0) return _ago(minutes ~/ 60, 'hour');
  if (days == 1) return 'Yesterday';
  if (days <= 6) return '$days days ago';
  final date = '${at.day} ${_months[at.month - 1]}';
  return at.year == now.year ? date : '$date ${at.year}';
}
