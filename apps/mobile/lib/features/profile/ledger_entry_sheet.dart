import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../core/format/relative_time.dart';
import '../../design/widgets/eq_badge.dart';
import '../../design/widgets/eq_page_state.dart';
import 'profile_controller.dart';
import 'profile_models.dart';

EqBadgeStatus ledgerStateBadge(LedgerState state) => switch (state) {
  LedgerState.newTag => EqBadgeStatus.info,
  LedgerState.practicing => EqBadgeStatus.warning,
  LedgerState.mastered => EqBadgeStatus.success,
};

String timesLabel(int count) => '$count ${count == 1 ? 'time' : 'times'}';

/// Opens a record's detail as a bottom sheet — the mobile form of the web's
/// dialog. [label] is known before the detail loads, so the sheet has its
/// title at once.
Future<void> showLedgerEntrySheet(
  BuildContext context, {
  required String entryId,
  required String label,
  required Future<LedgerEntryDetailView> Function(String entryId) load,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => LedgerEntrySheet(entryId: entryId, label: label, load: load),
  );
}

/// Resolves a tag to the caller's record and opens it — how F19's lesson
/// error-card chip lands on the ledger. Does nothing when the caller has no
/// record for the tag.
Future<void> showLedgerEntrySheetForTag(BuildContext context, ProfileController controller, String tag) async {
  final entry = await controller.findEntryByTag(tag);
  if (entry == null || !context.mounted) return;
  await showLedgerEntrySheet(context, entryId: entry.id, label: entry.label, load: controller.loadEntry);
}

/// Every example collected for a tag, each with the lesson or activity it
/// came from, and the sources list. Lesson sources are plain text until F19
/// ships the lesson-detail page they will open (F12 spec, A27).
class LedgerEntrySheet extends StatefulWidget {
  const LedgerEntrySheet({super.key, required this.entryId, required this.label, required this.load});

  final String entryId;
  final String label;
  final Future<LedgerEntryDetailView> Function(String entryId) load;

  @override
  State<LedgerEntrySheet> createState() => _LedgerEntrySheetState();
}

class _LedgerEntrySheetState extends State<LedgerEntrySheet> {
  LedgerEntryDetailView? _detail;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _failed = false;
      _detail = null;
    });
    try {
      final detail = await widget.load(widget.entryId);
      if (mounted) setState(() => _detail = detail);
    } on Exception {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final detail = _detail;

    final Widget body;
    if (_failed) {
      body = EqError(cause: 'This record could not be loaded.', onRetry: _fetch);
    } else if (detail == null) {
      body = const EqLoading(blockCount: 4, blockHeight: 48);
    } else {
      body = _DetailBody(detail: detail);
    }

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(EqSpacing.marginMobile, EqSpacing.lg, EqSpacing.marginMobile, EqSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Semantics(header: true, child: Text(widget.label, style: EqTextStyles.headlineSm(dark: dark))),
            SizedBox(height: EqSpacing.md),
            body,
          ],
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.detail});

  final LedgerEntryDetailView detail;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final entry = detail.entry;
    final muted = EqTextStyles.bodyMd(dark: dark).copyWith(
      color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
    );
    String when(DateTime at) => formatRelativeTime(at, reference: detail.serverTime);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: EqSpacing.sm,
          runSpacing: EqSpacing.sm,
          children: [
            EqBadge(status: ledgerStateBadge(entry.state), label: entry.state.label),
            if (entry.retired) const EqBadge(status: EqBadgeStatus.neutral, label: 'Retired'),
          ],
        ),
        SizedBox(height: EqSpacing.sm),
        Text(
          'Seen ${timesLabel(entry.occurrenceCount)} · first seen ${when(entry.firstSeenAt)} · '
          'last seen ${when(entry.lastSeenAt)}',
          style: muted,
        ),
        SizedBox(height: EqSpacing.lg),
        Text('Examples', style: EqTextStyles.titleMd(dark: dark)),
        SizedBox(height: EqSpacing.sm),
        if (detail.examples.isEmpty)
          Text('No examples were recorded for this tag.', style: muted)
        else
          for (final example in detail.examples)
            Padding(
              padding: EdgeInsets.only(bottom: EqSpacing.gutterMobile),
              child: _ExampleTile(example: example, when: when(example.occurredAt)),
            ),
        SizedBox(height: EqSpacing.md),
        Text('Sources', style: EqTextStyles.titleMd(dark: dark)),
        SizedBox(height: EqSpacing.sm),
        for (final source in detail.sources)
          Padding(
            padding: EdgeInsets.only(bottom: EqSpacing.xs),
            child: Text(
              '${source.sourceKind == LedgerSourceKind.lesson ? 'Lesson' : 'Activity'} · ${when(source.occurredAt)} · '
              '${timesLabel(source.occurrences)}',
              style: muted,
            ),
          ),
      ],
    );
  }
}

class _ExampleTile extends StatelessWidget {
  const _ExampleTile({required this.example, required this.when});

  final LedgerExample example;
  final String when;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = EqTextStyles.bodySm(dark: dark).copyWith(
      color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant,
    );
    final quote = example.quote;
    final instances = '${example.instances} failing ${example.instances == 1 ? 'instance' : 'instances'}';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? EqDarkColors.surface : EqLightColors.surface,
        borderRadius: BorderRadius.circular(EqRadius.md),
        border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
      ),
      child: Padding(
        padding: EdgeInsets.all(EqSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (quote != null) ...[
              Text('“$quote”', style: EqTextStyles.bodyMd(dark: dark)),
              if (example.correction != null) ...[
                SizedBox(height: EqSpacing.xs),
                Text('Correction: ${example.correction}', style: muted),
              ],
            ] else
              Text(
                'Words: ${example.exampleWords.map((word) => '“$word”').join(', ')} ($instances)',
                style: EqTextStyles.bodyMd(dark: dark),
              ),
            SizedBox(height: EqSpacing.xs),
            Text('${example.sourceKind == LedgerSourceKind.lesson ? 'Lesson' : 'Activity'} · $when', style: muted),
          ],
        ),
      ),
    );
  }
}
