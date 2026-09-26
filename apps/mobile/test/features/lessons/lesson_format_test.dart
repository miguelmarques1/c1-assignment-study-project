import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/format/relative_time.dart';
import 'package:mobile/features/lessons/lesson_format.dart';
import 'package:mobile/features/lessons/models/lesson_models.dart';

/// The case table shared with the web's `lesson-format.spec.ts`: every row
/// must print the same text on both clients.
void main() {
  final now = DateTime.parse('2026-09-25T15:00:00.000Z');

  test('formats_like_the_web', () {
    final cases = {
      '2026-09-25T14:59:30.000Z': 'Just now',
      '2026-09-25T14:59:00.000Z': '1 minute ago',
      '2026-09-25T14:55:00.000Z': '5 minutes ago',
      '2026-09-25T12:00:00.000Z': '3 hours ago',
      '2026-09-24T20:00:00.000Z': 'Yesterday',
      '2026-09-22T10:00:00.000Z': '3 days ago',
      '2026-09-18T10:00:00.000Z': '18 Sep',
      '2025-03-12T10:00:00.000Z': '12 Mar 2025',
      '2026-09-25T15:00:20.000Z': 'Just now',
    };
    for (final MapEntry(key: iso, value: text) in cases.entries) {
      expect(formatRelativeDate(DateTime.parse(iso), now: now, utcOffset: Duration.zero), text, reason: iso);
    }

    expect(formatDuration(42 * 60), '42 min');
    expect(formatDuration(3900), '1 h 05 min');
    expect(formatDuration(95), '2 min');
    expect(formatDuration(null), '—');
    expect(formatClock(247000), '04:07');
    expect(formatClock(3723000), '1:02:03');
    expect(formatElapsed(const Duration(seconds: 64)), '1m 04s');
    expect(formatElapsed(const Duration(seconds: 45)), '45s');
    expect(formatElapsed(const Duration(seconds: 7500)), '2h 05m');
    expect(formatBytes(13002342), '12.4 MB');
    expect(formatBytes(512), '512 B');
    expect(formatBytes(2048), '2.0 KB');
  });

  test('calendar_days_are_the_viewers', () {
    final late = DateTime.parse('2026-09-25T02:00:00.000Z');
    final morning = DateTime.parse('2026-09-24T12:00:00.000Z');
    expect(formatRelativeDate(morning, now: late, utcOffset: const Duration(hours: -3)), '14 hours ago');
    expect(formatRelativeDate(morning, now: late, utcOffset: Duration.zero), 'Yesterday');
    expect(formatAbsoluteDate(DateTime.parse('2026-09-24T14:10:03.000Z'), utcOffset: Duration.zero), '24 Sep 2026, 14:10');
  });

  test('participants_read_you_first', () {
    expect(
      formatParticipants(const [
        LessonParticipant(userId: 'a', displayName: 'Ana', isMe: false),
        LessonParticipant(userId: 'm', displayName: 'Miguel', isMe: true),
        LessonParticipant(userId: 'b', displayName: 'Bruno', isMe: false),
      ]),
      'You, Ana, Bruno',
    );
  });
}
