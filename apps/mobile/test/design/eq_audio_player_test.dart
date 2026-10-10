import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/audio/audio_playback_service.dart';
import 'package:mobile/design/widgets/eq_audio_player.dart';

import '../helpers/pump_screen.dart';

class _Playback implements AudioPlayback {
  _Playback({this.fail = false});

  bool fail;
  var loads = 0;
  var plays = 0;
  var pauses = 0;
  Duration? lastSeek;
  final playing = StreamController<bool>.broadcast();
  final position = StreamController<Duration>.broadcast();

  @override
  Future<Duration?> load(Uri uri, {Map<String, String>? headers}) async {
    loads += 1;
    if (fail) throw Exception('cannot load');
    return const Duration(seconds: 125);
  }

  @override
  Future<void> play() async {
    plays += 1;
    playing.add(true);
  }

  @override
  Future<void> pause() async {
    pauses += 1;
    playing.add(false);
  }

  @override
  Future<void> seek(Duration value) async => lastSeek = value;

  @override
  Stream<Duration> get positionStream => position.stream;

  @override
  Stream<bool> get playingStream => playing.stream;

  @override
  Stream<void> get completedStream => const Stream.empty();

  @override
  Future<void> dispose() async {}
}

Widget _player(_Playback playback, {VoidCallback? onFirstPlay, VoidCallback? onError, VoidCallback? onRetry}) => Padding(
  padding: const EdgeInsets.all(16),
  child: EqAudioPlayer(uri: Uri.parse('http://api.test/media'), playback: playback, onFirstPlay: onFirstPlay, onError: onError, onRetry: onRetry),
);

void main() {
  testWidgets('shows_the_duration_once_the_audio_has_loaded', (tester) async {
    final playback = _Playback();
    await pumpOnSmallPhone(tester, _player(playback));

    expect(find.text('0:00 / 2:05'), findsOneWidget);
    expect(playback.loads, 1);
  });

  testWidgets('play_and_pause_toggle', (tester) async {
    final playback = _Playback();
    await pumpOnSmallPhone(tester, _player(playback));

    await tester.tap(find.text('Play'));
    await tester.pumpAndSettle();
    expect(playback.plays, 1);
    expect(find.text('Pause'), findsOneWidget);

    await tester.tap(find.text('Pause'));
    await tester.pumpAndSettle();
    expect(playback.pauses, 1);
  });

  testWidgets('the_first_play_fires_once', (tester) async {
    final playback = _Playback();
    var firstPlays = 0;
    await pumpOnSmallPhone(tester, _player(playback, onFirstPlay: () => firstPlays += 1));

    await tester.tap(find.text('Play'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pause'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Play'));
    await tester.pumpAndSettle();

    expect(firstPlays, 1);
  });

  testWidgets('seek_moves_the_position', (tester) async {
    final playback = _Playback();
    await pumpOnSmallPhone(tester, _player(playback));

    await tester.drag(find.byType(Slider), const Offset(60, 0));
    await tester.pumpAndSettle();

    expect(playback.lastSeek, isNotNull);
    expect(playback.lastSeek!.inSeconds, greaterThan(0));
  });

  testWidgets('an_error_shows_the_message_with_retry', (tester) async {
    final playback = _Playback(fail: true);
    var errors = 0;
    var retries = 0;
    await pumpOnSmallPhone(tester, _player(playback, onError: () => errors += 1, onRetry: () => retries += 1));

    expect(find.text('This audio could not be loaded.'), findsOneWidget);
    expect(errors, 1);

    playback.fail = false;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(retries, 1);
    expect(playback.loads, 2);
    expect(find.text('This audio could not be loaded.'), findsNothing);
    expect(find.text('0:00 / 2:05'), findsOneWidget);
  });

  testWidgets('fits_a_small_phone_at_large_text', (tester) async {
    await pumpOnSmallPhone(tester, _player(_Playback()), textScale: 1.3);
    expect(tester.takeException(), isNull);
  });
}
