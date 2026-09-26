/// Relative dates, shared by every screen that shows when something happened
/// (F19's lesson history, F12's ledger). Same rules and case table as the
/// web's `lib/relative-time.ts`: `Just now` under a minute, `N minutes ago`
/// under an hour, `N hours ago` the same calendar day, `Yesterday`,
/// `N days ago` (2–6), then `12 Mar` this year or `12 Mar 2025` before it.
///
/// Calendar days are the viewer's: the device's local time by default, or a
/// fixed `utcOffset` (what a test pins).
library;

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

DateTime _viewer(DateTime instant, Duration? utcOffset) =>
    utcOffset == null ? instant.toLocal() : instant.toUtc().add(utcOffset);

String _plural(int count, String unit) => '$count $unit${count == 1 ? '' : 's'} ago';

/// `12 Mar`, or `12 Mar 2025` when the year differs from [now]'s.
String formatShortDate(DateTime date, {DateTime? now, Duration? utcOffset}) {
  final day = _viewer(date, utcOffset);
  final today = _viewer(now ?? DateTime.now(), utcOffset);
  final base = '${day.day} ${_months[day.month - 1]}';
  return day.year == today.year ? base : '$base ${day.year}';
}

String formatRelativeDate(DateTime date, {DateTime? now, Duration? utcOffset}) {
  final current = now ?? DateTime.now();
  final elapsed = current.difference(date);
  if (elapsed < const Duration(minutes: 1)) return 'Just now';
  if (elapsed < const Duration(hours: 1)) return _plural(elapsed.inMinutes, 'minute');

  final day = _viewer(date, utcOffset);
  final today = _viewer(current, utcOffset);
  final days = DateTime.utc(today.year, today.month, today.day).difference(DateTime.utc(day.year, day.month, day.day)).inDays;
  if (days <= 0) return _plural(elapsed.inHours, 'hour');
  if (days == 1) return 'Yesterday';
  if (days <= 6) return '$days days ago';
  return formatShortDate(date, now: current, utcOffset: utcOffset);
}
