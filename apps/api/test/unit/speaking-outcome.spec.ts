import { describe, expect, it } from 'vitest';

import type { FailingPhonemeGroup, MergedWord } from '../../src/speaking/scoring/attempt-result';
import { buildSpeakingOutcome, type BestAttemptEvidence } from '../../src/speaking/scoring/speaking-outcome';

const SCORED_AT = new Date('2026-01-01T00:00:00.000Z');

function mergedWord(overrides: Partial<MergedWord> & { word: string }): MergedWord {
  return { accuracy: 90, errorTypes: [], startMs: 0, durationMs: 200, phonemes: [], ...overrides };
}

function bestAttempt(overrides: Partial<BestAttemptEvidence> = {}): BestAttemptEvidence {
  return {
    id: 'attempt-1',
    scoredAt: SCORED_AT,
    scores: { pronunciation: 75, accuracy: 78, fluency: 82, prosody: 70, completeness: 96 },
    words: [],
    failingPhonemes: [],
    ...overrides,
  };
}

describe('buildSpeakingOutcome', () => {
  it('one_pronunciation_measurement_with_accuracy_and_prosody', () => {
    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-1',
      kind: 'pronunciation',
      targetTags: [],
      bestAttempt: bestAttempt(),
    });

    expect(outcome.measurements).toEqual([
      { competency: 'pronunciation', value: 75, accuracy: 78, prosody: 70 },
    ]);
  });

  it('one_occurrence_per_failing_phoneme_with_instances_and_up_to_five_words', () => {
    const failingPhonemes: FailingPhonemeGroup[] = [
      {
        tag: 'phoneme:/θ/',
        instances: 6,
        meanAccuracy: 40,
        examples: Array.from({ length: 6 }, (_, i) => ({ word: `word${i}`, startMs: i * 100, durationMs: 80, accuracy: 30 + i })),
      },
    ];

    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-1',
      kind: 'pronunciation',
      targetTags: [],
      bestAttempt: bestAttempt({ failingPhonemes }),
    });

    expect(outcome.errorOccurrences).toHaveLength(1);
    expect(outcome.errorOccurrences[0]).toMatchObject({ tag: 'phoneme:/θ/', instances: 6 });
    expect(outcome.errorOccurrences[0]!.exampleWords).toHaveLength(5);
  });

  it('correct_encounters_for_target_phonemes_measured_without_failure', () => {
    const words: MergedWord[] = [
      mergedWord({ word: 'this', phonemes: [{ phoneme: 'ð', accuracy: 92, offsetMs: 0, durationMs: 80 }] }),
    ];

    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-1',
      kind: 'pronunciation',
      targetTags: ['phoneme:/ð/'],
      bestAttempt: bestAttempt({ words }),
    });

    expect(outcome.correctEncounters).toEqual([{ tag: 'phoneme:/ð/' }]);
  });

  it('no_encounter_for_a_target_phoneme_not_measured', () => {
    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-1',
      kind: 'pronunciation',
      targetTags: ['phoneme:/ð/'],
      bestAttempt: bestAttempt({ words: [] }),
    });

    expect(outcome.correctEncounters).toEqual([]);
  });

  it('a_failing_target_phoneme_is_not_a_correct_encounter', () => {
    const words: MergedWord[] = [
      mergedWord({ word: 'think', phonemes: [{ phoneme: 'θ', accuracy: 30, offsetMs: 0, durationMs: 80 }] }),
    ];
    const failingPhonemes: FailingPhonemeGroup[] = [
      { tag: 'phoneme:/θ/', instances: 1, meanAccuracy: 30, examples: [{ word: 'think', startMs: 0, durationMs: 80, accuracy: 30 }] },
    ];

    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-1',
      kind: 'pronunciation',
      targetTags: ['phoneme:/θ/'],
      bestAttempt: bestAttempt({ words, failingPhonemes }),
    });

    expect(outcome.correctEncounters).toEqual([]);
  });

  it('open_response_sends_no_encounters', () => {
    const words: MergedWord[] = [
      mergedWord({ word: 'this', phonemes: [{ phoneme: 'ð', accuracy: 92, offsetMs: 0, durationMs: 80 }] }),
    ];

    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-1',
      kind: 'speaking',
      targetTags: ['discourse:hedging'],
      bestAttempt: bestAttempt({ words }),
    });

    expect(outcome.correctEncounters).toEqual([]);
  });

  it('keyed_on_the_lineage_root_with_the_best_attempt_as_revision', () => {
    const outcome = buildSpeakingOutcome({
      userId: 'user-1',
      rootActivityId: 'root-activity-id',
      kind: 'pronunciation',
      targetTags: [],
      bestAttempt: bestAttempt({ id: 'attempt-best' }),
    });

    expect(outcome.activityId).toBe('root-activity-id');
    expect(outcome.sourceKey).toBe('root-activity-id');
    expect(outcome.revision).toBe('attempt-best');
    expect(outcome.activityType).toBe('pronunciation');
    expect(outcome.occurredAt).toBe(SCORED_AT);
  });
});
