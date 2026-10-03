import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_modular/flutter_modular.dart';

import '../../../design/widgets/eq_button.dart';
import '../writing_models.dart';

/// Missing or invalid Gemini key: submission is prevented, and the draft is untouched.
class MissingKeyNotice extends StatelessWidget {
  const MissingKeyNotice({super.key, this.onGoToSettings});

  /// Tests observe navigation here; the app switches to the Settings tab.
  final VoidCallback? onGoToSettings;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return _NoticeBox(
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Add your Gemini key to have your writing corrected.',
              style: EqTextStyles.bodyMd(dark: dark).copyWith(color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface),
            ),
          ),
          SizedBox(width: EqSpacing.sm),
          InkWell(
            onTap: onGoToSettings ?? () => context.navigate('/app/settings'),
            child: Text(
              'Go to settings',
              style: EqTextStyles.labelMd(dark: dark).copyWith(color: dark ? EqDarkColors.primary : EqLightColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}

/// `Resets at {time}`, or `Resets tomorrow at {time}` when the reset falls on the caller's next local day.
String _formatResetLine(DateTime resetsAt, DateTime now) {
  final local = resetsAt.toLocal();
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  final period = local.hour < 12 ? 'AM' : 'PM';
  final time = '$hour:$minute $period';
  final sameDay = local.year == now.year && local.month == now.month && local.day == now.day;
  return sameDay ? 'Resets at $time' : 'Resets tomorrow at $time';
}

class LimitNotice extends StatelessWidget {
  const LimitNotice({super.key, required this.limit, required this.now});

  final WritingLimitView limit;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final resetsAt = limit.resetsAt;
    if (resetsAt == null) {
      return const SizedBox.shrink();
    }
    final dark = Theme.of(context).brightness == Brightness.dark;
    return _NoticeBox(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            "You have reached today's limit of ${limit.max} corrections.",
            style: EqTextStyles.bodyMd(dark: dark).copyWith(color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface),
          ),
          Text(
            _formatResetLine(resetsAt, now),
            style: EqTextStyles.bodySm(dark: dark).copyWith(color: dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// The server's own failure message, with a retry action (spec §4 failure modes).
class FailureNotice extends StatelessWidget {
  const FailureNotice({super.key, required this.message, required this.onRetry, required this.retrying});

  final String message;
  final VoidCallback onRetry;
  final bool retrying;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return _NoticeBox(
      tone: _NoticeTone.danger,
      child: Row(
        children: [
          Expanded(
            child: Text(message, style: EqTextStyles.bodyMd(dark: dark).copyWith(color: dark ? EqDarkColors.badgeDangerFg : EqLightColors.badgeDangerFg)),
          ),
          SizedBox(width: EqSpacing.sm),
          EqButton(label: 'Retry correction', onPressed: onRetry, loading: retrying, loadingLabel: 'Retrying…', size: EqButtonSize.sm),
        ],
      ),
    );
  }
}

enum _NoticeTone { neutral, danger }

class _NoticeBox extends StatelessWidget {
  const _NoticeBox({required this.child, this.tone = _NoticeTone.neutral});

  final Widget child;
  final _NoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final background = tone == _NoticeTone.danger
        ? (dark ? EqDarkColors.badgeDangerBg : EqLightColors.badgeDangerBg)
        : (dark ? EqDarkColors.surfaceContainer : EqLightColors.surfaceContainer);
    final outline = dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong;

    return Container(
      padding: EdgeInsets.all(EqSpacing.md),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(EqRadius.md),
        border: Border.all(color: outline, width: 2),
      ),
      child: child,
    );
  }
}
