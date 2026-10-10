import type { ObjectiveAnswer, ProfileCompetency } from '@english-quest/shared';

import type { ActivityOutcomeInput } from '../../profile/profile-ingestion.contract';
import { FAMILY_COMPETENCY, KIND_COMPETENCY, OUTCOME_TEXT_MAX_CHARS, type ObjectiveKind } from '../activity.constants';
import type { GradeOutcome } from './grading';
import type { QuestionCheck } from './question-check';
import { splitBlank } from './question-projection';

export interface ObjectiveOutcomeInput {
  userId: string;
  activityId: string;
  attemptId: string;
  kind: ObjectiveKind;
  /** The item's target tags. */
  targetTags: readonly string[];
  checks: readonly QuestionCheck[];
  answers: readonly ObjectiveAnswer[];
  graded: GradeOutcome;
  occurredAt: Date;
  familyOf: (tag: string) => string | null;
}

/**
 * The competencies a kind trains (A14). An error review has no fixed one, so
 * it measures each distinct competency its tags' families map to; a phoneme
 * tag maps to none, because Pronunciation comes only from Azure.
 */
export function competenciesFor(
  kind: ObjectiveKind,
  targetTags: readonly string[],
  familyOf: (tag: string) => string | null,
): ProfileCompetency[] {
  if (kind !== 'error_review') {
    return [KIND_COMPETENCY[kind]];
  }
  const found = new Set<ProfileCompetency>();
  for (const tag of targetTags) {
    const family = familyOf(tag);
    const competency = family ? FAMILY_COMPETENCY[family] : null;
    if (competency) {
      found.add(competency);
    }
  }
  return [...found];
}

function sentence(before: string, middle: string, after: string): string {
  return `${before}${middle}${after}`.trim().slice(0, OUTCOME_TEXT_MAX_CHARS);
}

/**
 * A graded attempt as F12's activity outcome (A12–A14). Unscored questions
 * write nothing. A multiple-choice miss carries no quote, because a picked
 * option is not a sentence the learner wrote; a fill-in-the-blank miss quotes
 * the learner's own sentence with the first accepted answer as correction.
 */
export function buildActivityOutcome(input: ObjectiveOutcomeInput): ActivityOutcomeInput {
  const answerAt = new Map(input.answers.map((answer) => [answer.index, answer]));
  const errorOccurrences: ActivityOutcomeInput['errorOccurrences'] = [];

  input.graded.results.forEach((result, position) => {
    const check = input.checks[position];
    if (result.outcome !== 'incorrect' || !check?.scorable) {
      return;
    }
    const answer = answerAt.get(check.index);
    for (const tag of input.targetTags) {
      if (check.question.format === 'fill_blank' && answer?.format === 'fill_blank') {
        const { before, after } = splitBlank(check.question.prompt);
        errorOccurrences.push({
          tag,
          quote: sentence(before, answer.text, after),
          correction: sentence(before, check.question.answer[0] ?? '', after),
        });
      } else {
        errorOccurrences.push({ tag });
      }
    }
  });

  const fullyCorrect = input.graded.scoreTotal > 0 && input.graded.scoreCorrect === input.graded.scoreTotal;
  const value = input.graded.scoreTotal > 0 ? Math.round((100 * input.graded.scoreCorrect) / input.graded.scoreTotal) : 0;

  return {
    userId: input.userId,
    activityId: input.activityId,
    sourceKey: input.attemptId,
    activityType: input.kind,
    occurredAt: input.occurredAt,
    measurements: competenciesFor(input.kind, input.targetTags, input.familyOf).map((competency) => ({ competency, value })),
    errorOccurrences,
    correctEncounters: fullyCorrect ? input.targetTags.map((tag) => ({ tag })) : [],
  };
}
