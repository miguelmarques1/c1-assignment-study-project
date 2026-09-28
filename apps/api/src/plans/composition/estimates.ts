import type { PlanActivityKind } from '@english-quest/shared';

import type { StudyPlanRules } from '../rules/plan-rules';

/** What `estimateMinutes` needs from an item; both fields are null for a task kind or an item missing the measure. */
export interface EstimateMetadata {
  durationSeconds: number | null;
  wordCount: number | null;
}

const FIXED_KINDS = ['vocabulary', 'grammar', 'error_review', 'writing', 'speaking', 'pronunciation'] as const;
type FixedKind = (typeof FIXED_KINDS)[number];

function isFixedKind(kind: PlanActivityKind): kind is FixedKind {
  return (FIXED_KINDS as readonly string[]).includes(kind);
}

/**
 * Minutes for one activity, computed in code from item metadata or the
 * rules file — never from the model (spec A10, PRD acceptance criterion).
 * Listening adds its two passes plus the questions; reading adds the
 * questions to its reading time. A missing measure (word count or
 * duration not yet recorded) falls back to the rules' fixed minutes for
 * that type rather than guessing.
 */
export function estimateMinutes(kind: PlanActivityKind, metadata: EstimateMetadata, rules: StudyPlanRules): number {
  if (kind === 'listening') {
    if (metadata.durationSeconds == null || metadata.durationSeconds <= 0) {
      return rules.estimates.fallbackMinutes.listening;
    }
    const listeningMinutes = Math.ceil((metadata.durationSeconds * rules.estimates.listeningPasses) / 60);
    return listeningMinutes + rules.estimates.questionMinutes;
  }
  if (kind === 'reading') {
    if (metadata.wordCount == null || metadata.wordCount <= 0) {
      return rules.estimates.fallbackMinutes.reading;
    }
    const readingMinutes = Math.ceil(metadata.wordCount / rules.estimates.wordsPerMinute);
    return readingMinutes + rules.estimates.questionMinutes;
  }
  if (isFixedKind(kind)) {
    return rules.estimates.fixedMinutes[kind];
  }
  // Exhaustive over PlanActivityKind: listening and reading handled above,
  // every other kind is in FIXED_KINDS. Unreachable, kept for type safety.
  throw new Error(`estimateMinutes: unhandled activity kind "${kind}"`);
}
