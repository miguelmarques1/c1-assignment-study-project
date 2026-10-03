import { describe, expect, it } from 'vitest';

import { activityOutcomeSchema } from '../../src/profile/profile-ingestion.contract';
import { toActivityOutcome } from '../../src/writing/correction/correction-outcome';

function baseInput() {
  return {
    correctionId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    resolvedActivityId: '33333333-3333-4333-8333-333333333333',
    occurredAt: new Date(),
    scores: { grammar: 68, vocabulary: 74, coherence: 79 },
    errors: [{ tag: 'grammar:conditional-3', quote: 'would have listened', correction: 'had listened' }],
  };
}

describe('toActivityOutcome', () => {
  it('maps_grammar_vocabulary_and_coherence_as_interaction', () => {
    const outcome = toActivityOutcome(baseInput());
    expect(outcome.measurements).toEqual([
      { competency: 'grammar', value: 68 },
      { competency: 'vocabulary', value: 74 },
      { competency: 'interaction', value: 79 },
    ]);
  });

  it('task_achievement_is_not_a_measurement', () => {
    const outcome = toActivityOutcome(baseInput());
    expect(outcome.measurements.some((m) => (m.competency as string) === 'task_achievement')).toBe(false);
    expect(outcome.measurements).toHaveLength(3);
  });

  it('one_occurrence_per_error_with_quote_and_correction', () => {
    const outcome = toActivityOutcome(baseInput());
    expect(outcome.errorOccurrences).toEqual([
      { tag: 'grammar:conditional-3', quote: 'would have listened', correction: 'had listened' },
    ]);
  });

  it('sends_no_correct_encounters', () => {
    expect(toActivityOutcome(baseInput()).correctEncounters).toEqual([]);
  });

  it('the_outcome_passes_f12s_contract_schema', () => {
    expect(() => activityOutcomeSchema.parse(toActivityOutcome(baseInput()))).not.toThrow();
  });
});
