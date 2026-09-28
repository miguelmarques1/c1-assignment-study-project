import type { ActivityOutcomeInput } from '../../profile/profile-ingestion.contract';

export interface CorrectionOutcomeError {
  tag: string;
  quote: string;
  correction: string;
}

export interface CorrectionOutcomeInput {
  correctionId: string;
  userId: string;
  /** The resolved activity id at completion time — may differ from the id the task was first opened under. */
  resolvedActivityId: string;
  occurredAt: Date;
  scores: { grammar: number; vocabulary: number; coherence: number };
  errors: readonly CorrectionOutcomeError[];
}

/**
 * Builds F12's outcome ingestion contract from a succeeded correction (A15,
 * A16). Grammar and Vocabulary map onto their own competencies; Coherence
 * maps onto Interaction. Task Achievement is not a profile competency (F12's
 * own downstream note) and is kept only on the correction row. No correct
 * encounters are ever sent: the correction has no way to tell whether a
 * target structure was used correctly, only whether it produced an error.
 */
export function toActivityOutcome(input: CorrectionOutcomeInput): ActivityOutcomeInput {
  return {
    userId: input.userId,
    activityId: input.resolvedActivityId,
    sourceKey: input.correctionId,
    activityType: 'writing',
    occurredAt: input.occurredAt,
    measurements: [
      { competency: 'grammar', value: input.scores.grammar },
      { competency: 'vocabulary', value: input.scores.vocabulary },
      { competency: 'interaction', value: input.scores.coherence },
    ],
    errorOccurrences: input.errors.map((error) => ({ tag: error.tag, quote: error.quote, correction: error.correction })),
    correctEncounters: [],
  };
}
