import 'dart:async';

import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../core/audio/audio_playback_service.dart';
import 'eq_button.dart';

String _clock(Duration value) {
  final seconds = value.inSeconds < 0 ? 0 : value.inSeconds;
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}

/// Mirrors the web's `AudioPlayer`: Play/Pause, a seek slider and
/// `m:ss / m:ss`, with an error state that offers `Try again`. Play is
/// disabled until the media has loaded, and [onFirstPlay] fires once.
class EqAudioPlayer extends StatefulWidget {
  const EqAudioPlayer({
    super.key,
    required this.uri,
    required this.playback,
    this.headers,
    this.onFirstPlay,
    this.onError,
    this.onRetry,
  });

  final Uri uri;
  final AudioPlayback playback;
  final Map<String, String>? headers;
  final VoidCallback? onFirstPlay;
  final VoidCallback? onError;
  final VoidCallback? onRetry;

  @override
  State<EqAudioPlayer> createState() => _EqAudioPlayerState();
}

class _EqAudioPlayerState extends State<EqAudioPlayer> {
  final List<StreamSubscription<Object?>> _subscriptions = [];
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  var _ready = false;
  var _playing = false;
  var _failed = false;
  var _started = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
    setState(() {
      _ready = false;
      _failed = false;
      _playing = false;
      _position = Duration.zero;
    });
    try {
      final duration = await widget.playback.load(
        widget.uri,
        headers: widget.headers,
      );
      if (!mounted) return;
      _subscriptions
        ..add(
          widget.playback.positionStream.listen((value) {
            if (mounted) setState(() => _position = value);
          }),
        )
        ..add(
          widget.playback.playingStream.listen((value) {
            if (mounted) setState(() => _playing = value);
          }),
        )
        ..add(
          widget.playback.completedStream.listen((_) {
            if (mounted) setState(() => _playing = false);
          }),
        );
      setState(() {
        _duration = duration ?? Duration.zero;
        _ready = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _failed = true);
      widget.onError?.call();
    }
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_playing) {
      await widget.playback.pause();
      return;
    }
    if (!_started) {
      _started = true;
      widget.onFirstPlay?.call();
    }
    await widget.playback.play();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final outline = dark
        ? EqDarkColors.outlineStrong
        : EqLightColors.outlineStrong;

    if (_failed) {
      return DecoratedBox(
        decoration: BoxDecoration(
          color: dark
              ? EqDarkColors.badgeDangerBg
              : EqLightColors.badgeDangerBg,
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(color: outline, width: 2),
        ),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'This audio could not be loaded.',
                style: EqTextStyles.bodyMd(dark: dark).copyWith(
                  color: dark
                      ? EqDarkColors.badgeDangerFg
                      : EqLightColors.badgeDangerFg,
                ),
              ),
              SizedBox(height: EqSpacing.sm),
              EqButton(
                label: 'Try again',
                variant: EqButtonVariant.neutral,
                size: EqButtonSize.sm,
                onPressed: () {
                  widget.onRetry?.call();
                  unawaited(_load());
                },
              ),
            ],
          ),
        ),
      );
    }

    final maxSeconds = _duration.inMilliseconds / 1000;
    final value = (_position.inMilliseconds / 1000)
        .clamp(0, maxSeconds <= 0 ? 0 : maxSeconds)
        .toDouble();

    return Material(
      type: MaterialType.transparency,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark
              ? EqDarkColors.surfaceContainerLowest
              : EqLightColors.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(color: outline, width: 2),
        ),
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: EqSpacing.sm,
            vertical: EqSpacing.sm,
          ),
          child: Row(
            children: [
              Semantics(
                button: true,
                label: _playing ? 'Pause' : 'Play',
                excludeSemantics: true,
                child: EqButton(
                  label: _playing ? 'Pause' : 'Play',
                  variant: EqButtonVariant.secondary,
                  size: EqButtonSize.sm,
                  onPressed: _ready ? _toggle : null,
                ),
              ),
              Expanded(
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    activeTrackColor: dark
                        ? EqDarkColors.secondary
                        : EqLightColors.secondary,
                    inactiveTrackColor: dark
                        ? EqDarkColors.surfaceContainerHighest
                        : EqLightColors.surfaceContainerHighest,
                    thumbColor: outline,
                    trackHeight: 4,
                  ),
                  child: Slider(
                    min: 0,
                    max: maxSeconds <= 0 ? 1 : maxSeconds,
                    value: value,
                    semanticFormatterCallback: (seconds) =>
                        _clock(Duration(seconds: seconds.round())),
                    onChanged: _ready
                        ? (seconds) {
                            final target = Duration(
                              milliseconds: (seconds * 1000).round(),
                            );
                            setState(() => _position = target);
                            unawaited(widget.playback.seek(target));
                          }
                        : null,
                  ),
                ),
              ),
              Text(
                '${_clock(_position)} / ${_clock(_duration)}',
                style: EqTextStyles.labelMd(dark: dark),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
