import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

/// Mirrors `apps/web/src/components/ui/meter.tsx`'s two states.
enum EqMeterState { scored, warmingUp }

/// A 0–100 score as a labelled bar, with its change since the previous
/// measurement: `▲ +4`, `▼ −2` (U+2212), or `—` when there was no previous
/// measurement at all ([noPreviousResult], the web's `delta: null`).
class EqMeter extends StatelessWidget {
  const EqMeter({
    super.key,
    required this.label,
    required this.value,
    this.state = EqMeterState.scored,
    this.delta,
    this.noPreviousResult = false,
  });

  final String label;

  /// 0–100. Only null while [state] is [EqMeterState.warmingUp].
  final int? value;
  final EqMeterState state;

  /// Signed change since the last measurement; null shows nothing unless [noPreviousResult].
  final int? delta;

  /// Renders an em dash read out as "no previous result" (a first lesson).
  final bool noPreviousResult;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final warmingUp = state == EqMeterState.warmingUp;
    final variant = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final (deltaText, deltaColor, deltaSpoken) = _delta(dark);
    final spoken = warmingUp
        ? '$label: warming up, not enough data yet'
        : '$label: $value out of 100${deltaSpoken == null ? '' : ', $deltaSpoken'}';

    return Semantics(
      container: true,
      label: spoken,
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: Text(label, style: EqTextStyles.labelMd(dark: dark).copyWith(color: variant))),
              if (warmingUp)
                Text('Warming up', style: EqTextStyles.labelMd(dark: dark).copyWith(color: variant))
              else
                Text.rich(
                  TextSpan(
                    text: '$value',
                    style: EqTextStyles.labelLg(dark: dark).copyWith(color: onSurface),
                    children: [
                      if (deltaText != null)
                        TextSpan(text: ' $deltaText', style: TextStyle(color: deltaColor)),
                    ],
                  ),
                ),
            ],
          ),
          SizedBox(height: EqSpacing.xs),
          _Bar(value: warmingUp ? null : value, dark: dark),
        ],
      ),
    );
  }

  (String?, Color?, String?) _delta(bool dark) {
    if (noPreviousResult) {
      return ('—', dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant, 'no previous result');
    }
    final change = delta;
    if (change == null || change == 0) return (null, null, null);
    if (change > 0) {
      return ('▲ +$change', dark ? EqDarkColors.tertiary : EqLightColors.tertiary, 'up $change');
    }
    return ('▼ −${change.abs()}', dark ? EqDarkColors.error : EqLightColors.error, 'down ${change.abs()}');
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.value, required this.dark});

  final int? value;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: EqSpacing.sm,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: dark ? EqDarkColors.surfaceContainerHighest : EqLightColors.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(EqRadius.full),
        border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
      ),
      child: value == null
          ? const SizedBox.expand()
          : FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: (value!.clamp(0, 100)) / 100,
              child: ColoredBox(color: dark ? EqDarkColors.primary : EqLightColors.primary),
            ),
    );
  }
}
