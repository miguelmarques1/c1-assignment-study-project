/// F19's display formatters — the same rules and case table as the web's
/// `components/lessons/format.ts`, so both clients print identical text.
library;

import '../../core/format/relative_time.dart';
import 'models/lesson_models.dart';

String _pad(int value) => value.toString().padLeft(2, '0');

/// A lesson's length: `42 min`, `1 h 05 min`.
String formatDuration(int? seconds) {
  if (seconds == null) return '—';
  final rounded = (seconds / 60).round();
  final minutes = seconds > 0 && rounded < 1 ? 1 : rounded;
  if (minutes < 60) return '$minutes min';
  return '${minutes ~/ 60} h ${_pad(minutes % 60)} min';
}

/// A transcript margin: `04:07`, or `1:02:03` past an hour.
String formatClock(int ms) {
  final total = ms < 0 ? 0 : ms ~/ 1000;
  final hours = total ~/ 3600;
  final minutes = (total % 3600) ~/ 60;
  final seconds = total % 60;
  return hours > 0 ? '$hours:${_pad(minutes)}:${_pad(seconds)}' : '${_pad(minutes)}:${_pad(seconds)}';
}

/// A stage's elapsed or completed time: `45s`, `1m 04s`, `2h 05m`.
String formatElapsed(Duration duration) {
  final total = duration.isNegative ? 0 : duration.inSeconds;
  if (total < 60) return '${total}s';
  if (total < 3600) return '${total ~/ 60}m ${_pad(total % 60)}s';
  return '${total ~/ 3600}h ${_pad((total % 3600) ~/ 60)}m';
}

/// Storage: `12.4 MB`, 1024-based with one decimal.
String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  var value = bytes / 1024;
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return '${value.toStringAsFixed(1)} ${units[unit]}';
}

/// A time of day in the viewer's clock: `14:32`.
String formatTimeOfDay(DateTime instant, {Duration? utcOffset}) {
  final local = utcOffset == null ? instant.toLocal() : instant.toUtc().add(utcOffset);
  return '${_pad(local.hour)}:${_pad(local.minute)}';
}

/// The header's absolute date: `24 Sep 2026, 14:10`.
String formatAbsoluteDate(DateTime instant, {Duration? utcOffset}) {
  final withYear = formatShortDate(instant, now: DateTime.utc(9999), utcOffset: utcOffset);
  return '$withYear, ${formatTimeOfDay(instant, utcOffset: utcOffset)}';
}

/// `You, Ana` — the caller first, then everyone else in join order.
String formatParticipants(List<LessonParticipant> participants) {
  final others = [
    for (final participant in participants)
      if (!participant.isMe) participant.displayName,
  ];
  return [if (participants.any((participant) => participant.isMe)) 'You', ...others].join(', ');
}
