import 'package:dio/dio.dart';
import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';
import 'package:get/get.dart';

import '../../core/format/relative_time.dart';
import '../../design/widgets/eq_badge.dart';
import '../../design/widgets/eq_button.dart';
import '../../design/widgets/eq_card.dart';
import '../../design/widgets/eq_meter.dart';
import '../../design/widgets/eq_page_state.dart';
import 'ledger_entry_sheet.dart';
import 'profile_controller.dart';
import 'profile_models.dart';

/// The learning profile (F12) — the mobile mirror of the web's `/profile`,
/// with the same copy and states. No mockup exists for either client; it is
/// composed from the `Eq*` widgets only. The web's detail dialog is a bottom
/// sheet here, and the empty state has no action because the live lesson is
/// web-only.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, this.controller});

  /// Injected by tests; the app builds one over the shared `Dio`.
  final ProfileController? controller;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final ProfileController _profile = widget.controller ?? ProfileController(inject<Dio>());

  @override
  void initState() {
    super.initState();
    _profile.load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SafeArea(
        child: Obx(() {
          final error = _profile.loadError.value;
          final view = _profile.view.value;

          final Widget content;
          if (error != null) {
            content = Padding(
              padding: EdgeInsets.only(top: EqSpacing.xl),
              child: EqError(cause: error, onRetry: _profile.load),
            );
          } else if (view == null) {
            content = const EqLoading(blockCount: 8, blockHeight: 32);
          } else if (view.empty) {
            content = Padding(
              padding: EdgeInsets.only(top: EqSpacing.xl),
              child: const EqEmpty(message: 'No profile yet. Your competencies appear after your first analysed lesson.'),
            );
          } else {
            content = _ProfileContent(view: view, profile: _profile);
          }

          return RefreshIndicator(
            onRefresh: _profile.load,
            child: ListView(
              padding: EdgeInsets.symmetric(horizontal: EqSpacing.marginMobile, vertical: EqSpacing.lg),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [const _Heading(), SizedBox(height: EqSpacing.lg), content],
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading();

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(header: true, child: Text('Learning profile', style: EqTextStyles.headlineSm(dark: dark))),
        SizedBox(height: EqSpacing.xs),
        Text(
          'Smoothed across your recent lessons and activities.',
          style: EqTextStyles.bodyMd(dark: dark).copyWith(
            color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _ProfileContent extends StatelessWidget {
  const _ProfileContent({required this.view, required this.profile});

  final LearningProfileView view;
  final ProfileController profile;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (view.notes.isNotEmpty) ...[
          EqCard(
            tone: EqCardTone.info,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final note in view.notes) Text(note, style: EqTextStyles.bodyMd(dark: dark))],
            ),
          ),
          SizedBox(height: EqSpacing.gutterMobile),
        ],
        EqCard(
          header: Text('Competencies', style: EqTextStyles.titleLg(dark: dark)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final entry in view.competencies)
                Padding(
                  padding: EdgeInsets.only(bottom: EqSpacing.md),
                  child: entry.competency == ProfileCompetency.pronunciation
                      ? _PronunciationTile(entry: entry)
                      : _competencyMeter(entry, entry.competency.label),
                ),
            ],
          ),
        ),
        SizedBox(height: EqSpacing.gutterMobile),
        EqCard(
          header: Text('Recurring weaknesses', style: EqTextStyles.titleLg(dark: dark)),
          child: view.recurringWeaknesses.isEmpty
              ? Text(
                  'No recurring weaknesses yet. A tag appears here once it occurs 3 times within 30 days.',
                  style: EqTextStyles.bodyMd(dark: dark),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final entry in view.recurringWeaknesses)
                      Padding(
                        padding: EdgeInsets.only(bottom: EqSpacing.sm),
                        child: _WeaknessRow(
                          entry: entry,
                          serverTime: view.serverTime,
                          onTap: () => showLedgerEntrySheet(
                            context,
                            entryId: entry.id,
                            label: entry.label,
                            load: profile.loadEntry,
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

EqMeter _competencyMeter(CompetencySnapshot entry, String label, {int? value}) {
  return EqMeter(
    label: label,
    value: entry.warmingUp ? null : (value ?? entry.score),
    state: entry.warmingUp ? EqMeterState.warmingUp : EqMeterState.scored,
    delta: value == null ? entry.delta : null,
  );
}

/// Pronunciation, with Accuracy and Prosody behind a disclosure — last in the
/// list, so opening it never pushes the other meters.
class _PronunciationTile extends StatefulWidget {
  const _PronunciationTile({required this.entry});

  final CompetencySnapshot entry;

  @override
  State<_PronunciationTile> createState() => _PronunciationTileState();
}

class _PronunciationTileState extends State<_PronunciationTile> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final entry = widget.entry;
    final subScores = entry.subScores;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _competencyMeter(entry, ProfileCompetency.pronunciation.label),
        if (subScores != null) ...[
          SizedBox(height: EqSpacing.sm),
          Align(
            alignment: Alignment.centerLeft,
            child: Semantics(
              expanded: _open,
              child: EqButton(
                label: _open ? 'Hide accuracy and prosody' : 'Show accuracy and prosody',
                variant: EqButtonVariant.neutral,
                size: EqButtonSize.sm,
                onPressed: () => setState(() => _open = !_open),
              ),
            ),
          ),
          if (_open) ...[
            SizedBox(height: EqSpacing.sm),
            Padding(
              padding: EdgeInsets.only(left: EqSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _competencyMeter(entry, 'Accuracy', value: subScores.accuracy),
                  SizedBox(height: EqSpacing.sm),
                  if (subScores.prosody == null)
                    Text(
                      'Prosody: not measured for this language',
                      style: EqTextStyles.bodySm(dark: dark).copyWith(
                        color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
                      ),
                    )
                  else
                    _competencyMeter(entry, 'Prosody', value: subScores.prosody),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

/// One tappable row per weakness: the human-readable name (never the raw
/// tag), how often, when last seen, the state and the trend — read by
/// screen readers as one sentence.
class _WeaknessRow extends StatelessWidget {
  const _WeaknessRow({required this.entry, required this.serverTime, required this.onTap});

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
