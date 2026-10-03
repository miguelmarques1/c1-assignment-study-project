import 'dart:math';

final Random _random = Random.secure();

/// A random v4 UUID for a submission's idempotency key (spec A9) — a few
/// lines rather than a new package dependency (A26).
String generateSubmissionId() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  String hex(int start, int end) => bytes.sublist(start, end).map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();

  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}
