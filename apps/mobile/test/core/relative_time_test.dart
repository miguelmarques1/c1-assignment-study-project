import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/format/relative_time.dart';

/// The shared case table: `apps/web/test/relative-time.spec.ts` pins the same
/// rows, so the two clients read every date the same way. Built from local
/// date parts, so it holds in any timezone.
final _serverTime = DateTime(2026, 9, 25, 10);

final _cases = <(String, DateTime, String)>[
  ('thirty seconds ago', DateTime(2026, 9, 25, 9, 59, 30), 'Just now'),
  ('a clock slightly ahead', DateTime(2026, 9, 25, 10, 5), 'Just now'),
  ('one minute ago', DateTime(2026, 9, 25, 9, 59), '1 minute ago'),
  ('forty-five minutes ago', DateTime(2026, 9, 25, 9, 15), '45 minutes ago'),
  ('two hours ago', DateTime(2026, 9, 25, 8), '2 hours ago'),
  ('early the same day', DateTime(2026, 9, 25, 0, 30), '9 hours ago'),
  ('late the previous day', DateTime(2026, 9, 24, 23, 30), 'Yesterday'),
  ('two calendar days back', DateTime(2026, 9, 23, 18), '2 days ago'),
  ('six calendar days back', DateTime(2026, 9, 19, 8), '6 days ago'),
  ('a week back', DateTime(2026, 9, 18, 12), '18 Sep'),
  ('earlier this year', DateTime(2026, 1, 3, 12), '3 Jan'),
  ('a previous year', DateTime(2025, 12, 31, 23), '31 Dec 2025'),
];

void main() {
  group('formatRelativeTime', () {
    test('formats_each_band_against_server_time', () {
      for (final (name, at, expected) in _cases) {
        expect(formatRelativeTime(at.toUtc(), reference: _serverTime.toUtc()), expected, reason: name);
      }
    });

    test('minutes_win_over_the_calendar_day_just_after_midnight', () {
      expect(
        formatRelativeTime(DateTime(2026, 9, 24, 23, 50), reference: DateTime(2026, 9, 25, 0, 10)),
        '20 minutes ago',
      );
    });
  });
}
