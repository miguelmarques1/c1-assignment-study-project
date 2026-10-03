import 'package:english_quest_tokens/english_quest_tokens.dart';
import 'package:flutter/material.dart';

import '../../../design/widgets/eq_button.dart';
import '../../../design/widgets/eq_card.dart';
import '../../plan/activity_routes.dart';
import '../../plan/plan_models.dart';
import '../../settings/credential_models.dart';

/// The earliest-day, earliest-position unfinished `pronunciation`/`speaking`
/// activity across the whole plan (A25).
PlanActivityView? _nextSpeakingActivity(StudyPlanView plan) {
  PlanActivityView? earliest;
  for (final session in plan.sessions) {
    for (final activity in session.activities) {
      final isSpeakingKind = activity.kind == PlanActivityKind.pronunciation || activity.kind == PlanActivityKind.speaking;
      final isUnfinished = activity.state == PlanActivityState.pending || activity.state == PlanActivityState.inProgress;
      if (!isSpeakingKind || !isUnfinished) continue;
      if (earliest == null || activity.day < earliest.day || (activity.day == earliest.day && activity.position < earliest.position)) {
        earliest = activity;
      }
    }
  }
  return earliest;
}

bool _azureKeyReady(List<MaskedCredential>? credentials) {
  if (credentials == null) return false;
  for (final credential in credentials) {
    if (credential.provider == CredentialProvider.azureSpeech && credential.status == CredentialStatus.valid) return true;
  }
  return false;
}

/// The `Treino de Pronúncia` card: standalone under the session card, same
/// precedent as F15's own Today card (A25). Mirrors the web's
/// `pronunciation-practice-card.tsx`.
class PronunciationPracticeCard extends StatelessWidget {
  const PronunciationPracticeCard({super.key, required this.plan, required this.credentials, this.onOpenActivity, this.onSeeFullPlan});

  final StudyPlanView? plan;
  final List<MaskedCredential>? credentials;

  /// Tests observe navigation here; the app pushes the activity's own runner or opens Settings.
  final void Function(String path)? onOpenActivity;

  /// Tests observe navigation here; the app switches to the Plan tab.
  final VoidCallback? onSeeFullPlan;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = dark ? EqDarkColors.onSurfaceVariant : EqLightColors.onSurfaceVariant;

    return EqCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: dark ? EqDarkColors.badgeDangerBg : EqLightColors.badgeDangerBg,
                  borderRadius: BorderRadius.circular(EqRadius.md),
                  border: Border.all(color: dark ? EqDarkColors.outlineStrong : EqLightColors.outlineStrong, width: 2),
                ),
                child: Padding(
                  padding: EdgeInsets.all(EqSpacing.xs),
                  child: Icon(Icons.mic_outlined, size: 24, color: dark ? EqDarkColors.onSurface : EqLightColors.onSurface),
                ),
              ),
              SizedBox(width: EqSpacing.sm),
              Expanded(child: Text('Pronunciation practice', style: EqTextStyles.titleLg(dark: dark))),
            ],
          ),
          SizedBox(height: EqSpacing.md),
          _body(dark, muted),
        ],
      ),
    );
  }

  Widget _body(bool dark, Color muted) {
    final plan = this.plan;
    if (plan == null) {
      return Text(
        'Read-aloud and speaking practice appear in your study plan after your first lesson.',
        style: EqTextStyles.bodyMd(dark: dark).copyWith(color: muted),
      );
    }

    if (!_azureKeyReady(credentials)) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add your Azure Speech key to use speaking activities.', style: EqTextStyles.bodyMd(dark: dark)),
          SizedBox(height: EqSpacing.sm),
          EqButton(label: 'Open settings', variant: EqButtonVariant.neutral, onPressed: () => onOpenActivity?.call('/app/settings')),
        ],
      );
    }

    final next = _nextSpeakingActivity(plan);
    if (next == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Every speaking activity in this plan is done.', style: EqTextStyles.bodyMd(dark: dark)),
          SizedBox(height: EqSpacing.sm),
          EqButton(label: 'See the full plan', variant: EqButtonVariant.neutral, onPressed: onSeeFullPlan),
        ],
      );
    }

    final path = activityRouteFor(next);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(next.title, style: EqTextStyles.bodyMd(dark: dark)),
        SizedBox(height: EqSpacing.xs),
        Text('${next.estimatedMinutes} min', style: EqTextStyles.labelMd(dark: dark).copyWith(color: muted)),
        if (path != null) ...[SizedBox(height: EqSpacing.sm), EqButton(label: 'Practice now', onPressed: () => onOpenActivity?.call(path))],
      ],
    );
  }
}
