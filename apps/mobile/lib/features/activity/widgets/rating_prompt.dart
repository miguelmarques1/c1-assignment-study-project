import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../../plan/plan_models.dart';
import '../activity_models.dart';
import 'palette.dart';

/// The one-tap difficulty rating (A17): three large buttons and a
/// `Not useful` link, dismissible and never blocking. It saves optimistically;
/// a failure shows an inline retry and leaves everything else usable.
class RatingPrompt extends StatefulWidget {
  const RatingPrompt({super.key, required this.initialRating, required this.initialNotUseful, required this.onRate});

  final DifficultyRating? initialRating;
  final bool initialNotUseful;

  /// Throws to report a failure.
  final Future<void> Function({required String? rating, required bool notUseful}) onRate;

  @override
  State<RatingPrompt> createState() => _RatingPromptState();
}

class _RatingPromptState extends State<RatingPrompt> {
  late DifficultyRating? _rating = widget.initialRating;
  late bool _notUseful = widget.initialNotUseful;
  var _dismissed = false;
  (DifficultyRating?, bool)? _failed;

  Future<void> _save(DifficultyRating? rating, bool notUseful) async {
    final previous = (_rating, _notUseful);
    setState(() {
      _rating = rating;
      _notUseful = notUseful;
      _failed = null;
    });
    try {
      await widget.onRate(rating: rating == null ? null : ratingWire(rating), notUseful: notUseful);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _rating = previous.$1;
        _notUseful = previous.$2;
        _failed = (rating, notUseful);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();
    final palette = EqPalette.of(context);
    const options = [
      (DifficultyRating.tooEasy, 'Too easy'),
      (DifficultyRating.justRight, 'Just right'),
      (DifficultyRating.tooHard, 'Too hard'),
    ];

    return DecoratedBox(
      decoration: palette.box(),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('How was this activity?', style: EqTextStyles.titleMd(dark: palette.dark)),
            SizedBox(height: EqSpacing.sm),
            for (final (rating, label) in options) ...[
              Semantics(
                selected: _rating == rating,
                child: EqButton(
                  label: label,
                  size: EqButtonSize.lg,
                  variant: _rating == rating ? EqButtonVariant.secondary : EqButtonVariant.neutral,
                  onPressed: () => _save(rating, _notUseful),
                ),
              ),
              SizedBox(height: EqSpacing.sm),
            ],
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Semantics(
                  selected: _notUseful,
                  child: TextButton(
                    onPressed: () => _save(_rating, !_notUseful),
                    child: Text(_notUseful ? 'Not useful ✓' : 'Not useful'),
                  ),
                ),
                TextButton(onPressed: () => setState(() => _dismissed = true), child: const Text('Not now')),
              ],
            ),
            if (_failed != null) ...[
              Text('Your rating could not be saved.', style: EqTextStyles.bodyMd(dark: palette.dark).copyWith(color: palette.error)),
              SizedBox(height: EqSpacing.xs),
              EqButton(
                label: 'Retry',
                size: EqButtonSize.sm,
                variant: EqButtonVariant.neutral,
                onPressed: () => _save(_failed!.$1, _failed!.$2),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
