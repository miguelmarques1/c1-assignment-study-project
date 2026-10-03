import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

const _sampleCount = 48;

/// The last 48 level samples as bars — a rolling history over a single
/// `level` reading (0-100 or null while idle), mirroring the web's
/// `recording-waveform.tsx`.
class RecordingWaveform extends StatefulWidget {
  const RecordingWaveform({super.key, required this.level});

  final int? level;

  @override
  State<RecordingWaveform> createState() => _RecordingWaveformState();
}

class _RecordingWaveformState extends State<RecordingWaveform> {
  final List<int> _samples = List.filled(_sampleCount, 0);

  @override
  void didUpdateWidget(RecordingWaveform oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.level != oldWidget.level) {
      setState(() {
        _samples.removeAt(0);
        _samples.add((widget.level ?? 0).clamp(0, 100));
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final color = dark ? EqDarkColors.secondary : EqLightColors.secondary;

    return ExcludeSemantics(
      child: SizedBox(
        height: 48,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (final sample in _samples)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: FractionallySizedBox(
                    heightFactor: (sample / 100).clamp(0.04, 1),
                    alignment: Alignment.bottomCenter,
                    child: DecoratedBox(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(EqRadius.sm))),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
