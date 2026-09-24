import { describe, expect, it } from 'vitest';

import {
  aggregatePronunciation,
  type AggregateInput,
  type AssessedExcerptInput,
  type AssessedExcerptWord,
} from '../../src/pronunciation/pronunciation-aggregate';

function word(
  text: string,
  accuracy: number,
  options: { phonemes?: Array<{ phoneme: string; accuracy: number }>; errorTypes?: string[] } = {},
): AssessedExcerptWord {
  return { word: text, accuracy, errorTypes: options.errorTypes ?? [], phonemes: options.phonemes ?? [] };
}

function excerpt(
  id: string,
  durationMs: number,
  words: AssessedExcerptWord[],
  scores: Partial<AssessedExcerptInput['scores']> = {},
): AssessedExcerptInput {
  return {
    excerptId: id,
    utteranceId: `${id}-utterance`,
    durationMs,
    scores: { pronunciation: 80, accuracy: 80, fluency: 80, prosody: 80, completeness: 80, ...scores },
    words,
  };
}

function input(overrides: Partial<AggregateInput> & { assessedExcerpts: AssessedExcerptInput[] }): AggregateInput {
  return {
    excerptCount: overrides.assessedExcerpts.length,
    sparseSample: false,
    quotaExhausted: false,
    ...overrides,
  };
}

describe('aggregatePronunciation', () => {
  it('scores_are_duration_weighted_means', () => {
    const decision = aggregatePronunciation(
      input({
        assessedExcerpts: [
          excerpt('a', 10_000, [], { pronunciation: 90, accuracy: 90, fluency: 90, prosody: 90, completeness: 90 }),
          excerpt('b', 30_000, [], { pronunciation: 50, accuracy: 50, fluency: 50, prosody: 50, completeness: 50 }),
        ],
      }),
    );

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.scores.pronunciation).toBe(60);
    expect(decision.result.scores.pronunciation).not.toBe(70);
  });

  it('prosody_mean_covers_only_excerpts_that_report_it', () => {
    const withNull = aggregatePronunciation(
      input({
        assessedExcerpts: [
          excerpt('a', 10_000, [], { prosody: 80 }),
          excerpt('b', 10_000, [], { prosody: 40 }),
          excerpt('c', 10_000, [], { prosody: null }),
        ],
      }),
    );
    expect(withNull.outcome).toBe('complete');
    if (withNull.outcome === 'complete') {
      expect(withNull.result.scores.prosody).toBe(60);
    }

    const allNull = aggregatePronunciation(
      input({ assessedExcerpts: [excerpt('a', 10_000, [], { prosody: null }), excerpt('b', 10_000, [], { prosody: null })] }),
    );
    expect(allNull.outcome).toBe('complete');
    if (allNull.outcome === 'complete') {
      expect(allNull.result.scores.prosody).toBeNull();
    }
  });

  it('ranks_the_five_worst_phonemes_with_counts_and_examples', () => {
    const specs: Array<[string, number]> = [
      ['d', 5], ['d', 5], ['d', 5],
      ['a', 10], ['a', 20], ['a', 30],
      ['b', 15], ['b', 25],
      ['c', 40], ['c', 50],
      ['e', 55], ['e', 58],
      ['f', 35], ['f', 45],
      ['g', 59], ['g', 59],
      ['h', 45],
    ];
    const words = specs.map(([phoneme, accuracy], i) => word(`w${i}`, accuracy, { phonemes: [{ phoneme, accuracy }] }));

    const decision = aggregatePronunciation(input({ assessedExcerpts: [excerpt('a', 5_000, words)] }));

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.worstPhonemes).toHaveLength(5);
    expect(decision.result.worstPhonemes.map((p) => p.phoneme)).toEqual(['d', 'a', 'b', 'f', 'c']);
    expect(decision.result.worstPhonemes.map((p) => p.phoneme)).not.toContain('h');
    expect(decision.result.worstPhonemes[0]).toMatchObject({ phoneme: 'd', meanAccuracy: 5, occurrences: 3, exampleWord: 'w0' });
    // Ascending mean accuracy.
    const means = decision.result.worstPhonemes.map((p) => p.meanAccuracy);
    expect(means).toEqual([...means].sort((a, b) => a - b));
  });

  it('ranks_the_ten_worst_words_without_miscues', () => {
    const words = [
      word('Through,', 40),
      word('through', 60),
      word('cat', 70),
      word('dog', 65),
      word('elephant', 55),
      word('fish', 75),
      word('giraffe', 80),
      word('horse', 85),
      word('iguana', 90),
      word('jaguar', 95),
      word('koala', 45),
      word('mouse', 48),
      word('lion', 52),
      word('omitted', 0, { errorTypes: ['Omission'] }),
    ];

    const decision = aggregatePronunciation(input({ assessedExcerpts: [excerpt('a', 5_000, words)] }));

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.worstWords).toHaveLength(10);
    expect(decision.result.worstWords.some((w) => w.word === 'omitted')).toBe(false);
    const through = decision.result.worstWords.find((w) => w.word === 'through');
    expect(through).toMatchObject({ occurrences: 2, meanAccuracy: 50 });
    expect(decision.result.worstWords.map((w) => w.word)).not.toContain('iguana');
    expect(decision.result.worstWords.map((w) => w.word)).not.toContain('jaguar');
  });

  it('emits_phoneme_tags_for_failures_below_60', () => {
    const words = [
      word('theta1', 40, { phonemes: [{ phoneme: 'θ', accuracy: 40 }] }),
      word('theta2', 55, { phonemes: [{ phoneme: 'θ', accuracy: 55 }] }),
      word('theta3', 80, { phonemes: [{ phoneme: 'θ', accuracy: 80 }] }),
      word('ash', 70, { phonemes: [{ phoneme: 'æ', accuracy: 70 }] }),
    ];

    const decision = aggregatePronunciation(input({ assessedExcerpts: [excerpt('a', 5_000, words)] }));

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.phonemeTags).toEqual([
      { tag: 'phoneme:/θ/', phoneme: 'θ', occurrences: 2, meanAccuracy: 47.5, exampleWords: ['theta1', 'theta2'] },
    ]);
    expect(decision.result.phonemeTags.some((t) => t.phoneme === 'æ')).toBe(false);
  });

  it('eight_of_twelve_is_partial', () => {
    const assessed = Array.from({ length: 8 }, (_, i) => excerpt(`e${i}`, 5_000, []));

    const decision = aggregatePronunciation(input({ assessedExcerpts: assessed, excerptCount: 12 }));

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.assessedCount).toBe(8);
    expect(decision.result.partialAssessment).toBe(true);
    expect(decision.result.notes).toContain('Based on 8 of 12 excerpts; some could not be assessed.');
  });

  it('seven_of_twelve_fails_with_the_count', () => {
    const assessed = Array.from({ length: 7 }, (_, i) => excerpt(`e${i}`, 5_000, []));

    const decision = aggregatePronunciation(input({ assessedExcerpts: assessed, excerptCount: 12 }));

    expect(decision).toEqual({ outcome: 'fail', reason: 'Too few excerpts could be assessed (7 of 12).' });
  });

  it('all_assessed_is_not_partial', () => {
    const assessed = Array.from({ length: 12 }, (_, i) => excerpt(`e${i}`, 5_000, []));

    const decision = aggregatePronunciation(input({ assessedExcerpts: assessed, excerptCount: 12 }));

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.partialAssessment).toBe(false);
    expect(decision.result.notes.some((note) => note.includes('of 12 excerpts'))).toBe(false);
  });

  it('sparse_and_quota_notes', () => {
    const assessed = Array.from({ length: 3 }, (_, i) => excerpt(`e${i}`, 5_000, []));

    const decision = aggregatePronunciation(
      input({ assessedExcerpts: assessed, excerptCount: 5, sparseSample: true, quotaExhausted: true }),
    );

    expect(decision.outcome).toBe('complete');
    if (decision.outcome !== 'complete') return;
    expect(decision.result.notes).toEqual([
      'Based on only 3 excerpts — this score is less reliable than usual.',
      'Based on 3 of 5 excerpts; some could not be assessed.',
      'Azure Speech quota was exhausted during assessment.',
    ]);
  });

  it('is_deterministic', () => {
    const words = [
      word('alpha', 30, { phonemes: [{ phoneme: 'p', accuracy: 20 }] }),
      word('beta', 45, { phonemes: [{ phoneme: 'p', accuracy: 55 }] }),
      word('gamma', 70, { phonemes: [{ phoneme: 't', accuracy: 65 }] }),
    ];
    const excerpts = [
      excerpt('a', 8_000, [words[0]!, words[1]!], { pronunciation: 72 }),
      excerpt('b', 12_000, [words[2]!], { pronunciation: 91 }),
      excerpt('c', 5_000, [], { pronunciation: 55 }),
    ];

    const first = aggregatePronunciation(input({ assessedExcerpts: excerpts, excerptCount: 3 }));
    const shuffled = [excerpts[2]!, excerpts[0]!, excerpts[1]!];
    const second = aggregatePronunciation(input({ assessedExcerpts: shuffled, excerptCount: 3 }));

    expect(second).toEqual(first);
  });
});
