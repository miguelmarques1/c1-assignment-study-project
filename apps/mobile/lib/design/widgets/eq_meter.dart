import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors `apps/web/src/components/ui/meter.tsx`'s two states.
enum EqMeterState { scored, warmingUp }

/// A 0–100 score as a labelled bar, with its change since the previous
/// measurement: `▲ +4`, `▼ −2` (U+2212), or `—` when there was no previous
/// measurement at all ([noPreviousResult], the web's `delta: null`). While
/// [state] is [EqMeterState.warmingUp] (fewer than three measurements) the
/// number is replaced by `Warming up`, the track is hatched, and the
/// semantics say so — the same contract as the web's.
class EqMeter extends StatelessWidget {
  const EqMeter({
    super.key,
    required this.label,
    required this.value,
    this.state = EqMeterState.scored,
    this.delta,
    this.noPreviousResult = false,
  });

  /// The accessible name; also rendered as visible text.
  final String label;

  /// 0–100. Only null while [state] is [EqMeterState.warmingUp].
  final int? value;
  final EqMeterState state;

  /// Signed change since the last measurement. Zero, or null without
  /// [noPreviousResult], renders nothing, like the web.
  final int? delta;

  /// Renders an em dash read out as "no previous result" (F19's first lesson).
  final bool noPreviousResult;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final warmingUp = state == EqMeterState.warmingUp;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
    final track = dark ? EqDarkColors.surfaceContainerHighest : EqLightColors.surfaceContainerHighest;
    final fill = dark ? EqDarkColors.primary : EqLightColors.primary;
    final clamped = (value ?? 0).clamp(0, 100);
    final (deltaText, deltaColor, deltaSpoken) = _delta(dark);

    final semanticsLabel = warmingUp
        ? '$label: warming up, not enough data yet'
        : '$label: $clamped out of 100${deltaSpoken == null ? '' : ', $deltaSpoken'}';

    return Semantics(
      container: true,
      label: semanticsLabel,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: EqTextStyles.labelMd(dark: dark).copyWith(color: muted))),
              SizedBox(width: EqSpacing.sm),
              if (warmingUp)
                Text('Warming up', style: EqTextStyles.labelMd(dark: dark).copyWith(color: muted))
              else
                Text.rich(
                  TextSpan(
                    text: '$clamped',
                    style: EqTextStyles.labelLg(dark: dark).copyWith(color: onSurface),
                    children: [
                      if (deltaText != null)
                        TextSpan(
                          text: ' $deltaText',
                          style: EqTextStyles.labelLg(dark: dark).copyWith(color: deltaColor),
                        ),
                    ],
                  ),
                ),
            ],
          ),
          SizedBox(height: EqSpacing.xs),
          Container(
            height: EqSpacing.sm,
            decoration: BoxDecoration(
              color: track,
              borderRadius: BorderRadius.circular(EqRadius.full),
              border: Border.all(color: outline, width: 2),
            ),
            clipBehavior: Clip.antiAlias,
            child: warmingUp
                ? CustomPaint(
                    key: const Key('eq-meter-warming-track'),
                    painter: _HatchPainter(dark ? EqDarkColors.outlineVariant : EqLightColors.outlineVariant),
                  )
                : FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: clamped / 100,
                    child: ColoredBox(color: fill),
                  ),
          ),
        ],
      ),
    );
  }

  /// The visible delta, its colour and how it is read out; all null when nothing renders.
  (String?, Color?, String?) _delta(bool dark) {
    final change = delta;
    if (change == null) {
      return noPreviousResult
          ? ('—', dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant, 'no previous result')
          : (null, null, null);
    }
    if (change == 0) return (null, null, null);
    if (change > 0) {
      return ('▲ +$change', dark ? EqDarkColors.tertiary : EqLightColors.tertiary, 'up $change');
    }
    return ('▼ −${change.abs()}', dark ? EqDarkColors.error : EqLightColors.error, 'down ${change.abs()}');
  }
}

/// The web's `meter-track-warming`: 45° stripes, 4 px on and 4 px off.
class _HatchPainter extends CustomPainter {
  _HatchPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 4;
    for (var x = -size.height; x < size.width + size.height; x += 8) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), paint);
    }
  }

  @override
  bool shouldRepaint(_HatchPainter oldDelegate) => oldDelegate.color != color;
}
