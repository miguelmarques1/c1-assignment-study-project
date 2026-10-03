import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../design/widgets/eq_button.dart';
import '../plan/plan_models.dart';

class DifficultyRatingValue {
  const DifficultyRatingValue({required this.rating, required this.notUseful});

  final DifficultyRating? rating;
  final bool notUseful;
}

const _options = [
  (rating: DifficultyRating.tooEasy, label: 'Too easy'),
  (rating: DifficultyRating.justRight, label: 'Just right'),
  (rating: DifficultyRating.tooHard, label: 'Too hard'),
];

/// Three difficulty buttons plus a `Not useful` link, dismissible on its own
/// and never blocking the rest of the activity (F16's shared widget, built
/// here first since F18 shipped ahead of it; mirrors the web's
/// `difficulty-rating.tsx`).
class DifficultyRatingWidget extends StatefulWidget {
  const DifficultyRatingWidget({super.key, required this.value, required this.onRate});

  final DifficultyRatingValue? value;
  final Future<void> Function(DifficultyRatingValue input) onRate;

  @override
  State<DifficultyRatingWidget> createState() => _DifficultyRatingWidgetState();
}

class _DifficultyRatingWidgetState extends State<DifficultyRatingWidget> {
  var _dismissed = false;
  DifficultyRating? _submitting;
  var _submittingNotUseful = false;

  Future<void> _submit(DifficultyRatingValue input, {DifficultyRating? rating, bool notUseful = false}) async {
    setState(() {
      _submitting = rating;
      _submittingNotUseful = notUseful;
    });
    try {
      await widget.onRate(input);
    } finally {
      if (mounted) setState(() => _submitting = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();
    final dark = Theme.of(context).brightness == Brightness.dark;
    final current = widget.value;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Wrap(
            spacing: EqSpacing.xs,
            runSpacing: EqSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('How was this activity?', style: EqTextStyles.labelMd(dark: dark)),
              for (final option in _options)
                EqButton(
                  label: option.label,
                  size: EqButtonSize.sm,
                  variant: current?.rating == option.rating ? EqButtonVariant.secondary : EqButtonVariant.neutral,
                  loading: _submitting == option.rating,
                  loadingLabel: 'Working…',
                  onPressed: () => _submit(
                    DifficultyRatingValue(rating: option.rating, notUseful: current?.notUseful ?? false),
                    rating: option.rating,
                  ),
                ),
              TextButton(
                onPressed: () => _submit(
                  DifficultyRatingValue(rating: current?.rating, notUseful: true),
                  notUseful: true,
                ),
                child: Text(_submittingNotUseful && _submitting == null ? 'Working…' : 'Not useful'),
              ),
            ],
          ),
        ),
        IconButton(
          icon: const Icon(Icons.close, size: 16),
          tooltip: 'Dismiss rating',
          onPressed: () => setState(() => _dismissed = true),
        ),
      ],
    );
  }
}
