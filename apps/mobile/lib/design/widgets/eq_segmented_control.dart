import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

class EqSegmentedOption<T> {
  const EqSegmentedOption({required this.value, required this.label});

  final T value;
  final String label;
}

/// Mirrors `apps/web/src/components/ui/segmented-control.tsx`: a choice within
/// the page, in the pill-in-container look of the web's `NavPill`. Each
/// option is a 48 dp target announced as one of a mutually exclusive group,
/// with the selected one marked, and [label] names the group.
class EqSegmentedControl<T> extends StatelessWidget {
  const EqSegmentedControl({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
    required this.label,
  });

  final List<EqSegmentedOption<T>> options;
  final T value;
  final ValueChanged<T> onChanged;

  /// The group accessible name (`Time range`).
  final String label;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;
    final container = dark ? EqDarkColors.surfaceContainer : EqLightColors.surfaceContainer;
    final lowest = dark ? EqDarkColors.surfaceContainerLowest : EqLightColors.surfaceContainerLowest;
    final onSurface = dark ? EqDarkColors.onSurface : EqLightColors.onSurface;
    final variant = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    return Semantics(
      container: true,
      label: label,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: container,
          borderRadius: BorderRadius.circular(EqRadius.lg),
          border: Border.all(color: outline, width: 2),
        ),
        child: Padding(
          padding: EdgeInsets.all(EqSpacing.xs),
          child: Row(
            children: [
              for (final option in options)
                Expanded(
                  child: Semantics(
                    button: true,
                    inMutuallyExclusiveGroup: true,
                    selected: option.value == value,
                    label: option.label,
                    excludeSemantics: true,
                    onTap: () => onChanged(option.value),
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => onChanged(option.value),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 48),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: option.value == value ? lowest : container,
                            borderRadius: BorderRadius.circular(EqRadius.md),
                            border: Border.all(color: option.value == value ? outline : container, width: 2),
                          ),
                          child: Center(
                            child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: EqSpacing.xs),
                              child: Text(
                                option.label,
                                textAlign: TextAlign.center,
                                style: EqTextStyles.labelLg(dark: dark).copyWith(
                                  color: option.value == value ? onSurface : variant,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
