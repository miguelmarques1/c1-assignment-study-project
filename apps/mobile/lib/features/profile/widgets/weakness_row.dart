import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../core/format/relative_time.dart';
import '../../../design/widgets/eq_badge.dart';
import '../ledger_entry_sheet.dart';
import '../profile_models.dart';

/// One tappable row per weakness: the human-readable name (never the raw
/// tag), how often, when last seen, the state and the trend — read by
/// screen readers as one sentence.
class WeaknessRow extends StatelessWidget {
  const WeaknessRow({super.key, required this.entry, required this.serverTime, required this.onTap});

  final LedgerEntry entry;
  final DateTime serverTime;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final lastSeen = formatRelativeTime(entry.lastSeenAt, reference: serverTime);
    final trendColor = switch (entry.trend) {
      TagTrend.rising => dark ? EqDarkColors.error : EqLightColors.error,
      TagTrend.falling => dark ? EqDarkColors.tertiary : EqLightColors.tertiary,
      TagTrend.flat => dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
    };

    // One node that reads the whole row and carries the tap itself, since the
    // excluded InkWell's own action would otherwise go with its semantics.
    return Semantics(
      container: true,
      button: true,
      label:
          '${entry.label}: ${timesLabel(entry.occurrenceCount)}, last seen $lastSeen, '
          '${entry.state.label}, ${entry.trend.word}',
      onTap: onTap,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark ? EqDarkColors.surface : EqLightColors.surface,
          borderRadius: BorderRadius.circular(EqRadius.md),
          border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(EqRadius.md),
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Padding(
                padding: EdgeInsets.all(EqSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(entry.label, style: EqTextStyles.titleMd(dark: dark)),
                    SizedBox(height: EqSpacing.xs),
                    Text(
                      '${timesLabel(entry.occurrenceCount)} · last seen $lastSeen',
                      style: EqTextStyles.bodySm(dark: dark).copyWith(
                        color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
                      ),
                    ),
                    SizedBox(height: EqSpacing.sm),
                    Wrap(
                      spacing: EqSpacing.sm,
                      runSpacing: EqSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        EqBadge(status: ledgerStateBadge(entry.state), label: entry.state.label),
                        Text(
                          '${entry.trend.symbol} ${entry.trend.word}',
                          style: EqTextStyles.labelMd(dark: dark).copyWith(color: trendColor),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
