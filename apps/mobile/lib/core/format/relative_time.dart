/// The one relative-time wording both clients use (F12's ledger, F19's lesson
/// history), the twin of the web's `lib/relative-time.ts` and pinned by the
/// same case table: `Just now` under a minute, `N minutes ago` under an hour,
/// `N hours ago` on the same calendar day, `Yesterday`, `N days ago` up to six
/// days, then `12 Mar` — with the year only before the current one.
///
/// `reference` is the view's `serverTime` when it carries one, so a skewed
/// device clock never shows the future. Calendar days are the viewer's: the
/// device's local time by default, or a fixed `utcOffset` (what a test pins).
library;

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

DateTime _viewer(DateTime instant, Duration? utcOffset) =>
    utcOffset == null ? instant.toLocal() : instant.toUtc().add(utcOffset);

String _ago(int count, String unit) => '$count $unit${count == 1 ? '' : 's'} ago';

/// `12 Mar`, or `12 Mar 2025` when the year differs from [now]'s.
String formatShortDate(DateTime date, {DateTime? now, Duration? utcOffset}) {
  final day = _viewer(date, utcOffset);
  final today = _viewer(now ?? DateTime.now(), utcOffset);
  final base = '${day.day} ${_months[day.month - 1]}';
  return day.year == today.year ? base : '$base ${day.year}';
}

String formatRelativeTime(DateTime value, {DateTime? reference, Duration? utcOffset}) {
  final now = reference ?? DateTime.now();
  final elapsed = now.difference(value);
  if (elapsed < const Duration(minutes: 1)) return 'Just now';
  if (elapsed < const Duration(hours: 1)) return _ago(elapsed.inMinutes, 'minute');

  // Calendar days from UTC dates of the viewer's calendar parts, so a
  // daylight-saving hour never shifts the count.
  final day = _viewer(value, utcOffset);
  final today = _viewer(now, utcOffset);
  final days = DateTime.utc(today.year, today.month, today.day).difference(DateTime.utc(day.year, day.month, day.day)).inDays;
  if (days <= 0) return _ago(elapsed.inHours, 'hour');
  if (days == 1) return 'Yesterday';
  if (days <= 6) return '$days days ago';
  return formatShortDate(value, now: now, utcOffset: utcOffset);
}
