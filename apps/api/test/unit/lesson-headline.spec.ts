import { describe, expect, it } from 'vitest';

import type { AnalysisScorePoint } from '../../src/analysis/analysis-result.reader';
import { deltasByLesson, headlineText, type LessonDeltas } from '../../src/lessons/lesson-headline';
import type { PronunciationScorePoint } from '../../src/pronunciation/pronunciation-result.reader';

function day(n: number): Date {
  return new Date(Date.UTC(2026, 8, n, 14, 0, 0));
}

function analysis(lessonId: string, startedAt: Date, grammar: number, rest = 70): AnalysisScorePoint {
  return {
    lessonId,
    startedAt,
    scores: { grammar, vocabulary: rest, fluency: rest, interaction: rest, comprehension: rest },
  };
}

function pronunciation(lessonId: string, startedAt: Date, value: number): PronunciationScorePoint {
  return { lessonId, startedAt, pronunciation: value };
}

function deltas(overrides: Partial<LessonDeltas>): LessonDeltas {
  return {
    grammar: 0,
    vocabulary: 0,
    fluency: 0,
    interaction: 0,
    comprehension: 0,
    pronunciation: 0,
    ...overrides,
  };
}

describe('deltasByLesson', () => {
  it('deltas_compare_with_the_previous_measurement_of_each_dimension', () => {
    // L2 has no analysis (not ready); L3 has no pronunciation (no_sample).
    const result = deltasByLesson(
      [analysis('L1', day(1), 60), analysis('L3', day(3), 64, 72), analysis('L4', day(4), 61, 72)],
      [pronunciation('L1', day(1), 70.4), pronunciation('L2', day(2), 75.6), pronunciation('L4', day(4), 73.5)],
    );

    // The first measurement of every dimension has nothing to compare with.
    expect(result.get('L1')).toEqual({
      grammar: null,
      vocabulary: null,
      fluency: null,
      interaction: null,
      comprehension: null,
      pronunciation: null,
    });
    // L3's analysis skips L2's gap and compares with L1; its pronunciation is simply absent.
    expect(result.get('L3')).toMatchObject({ grammar: 4, vocabulary: 2, pronunciation: null });
    // L4's pronunciation compares with L2 (rounded 74 − 76), skipping L3's no-sample lesson.
    expect(result.get('L4')).toMatchObject({ grammar: -3, vocabulary: 0, pronunciation: -2 });
    expect(result.get('L2')).toMatchObject({ grammar: null, pronunciation: 6 });
  });

  it('a_lesson_starting_at_the_same_instant_is_not_its_own_previous', () => {
    const result = deltasByLesson([analysis('A', day(1), 60), analysis('B', day(1), 70), analysis('C', day(2), 75)], []);
    expect(result.get('A')!.grammar).toBeNull();
    expect(result.get('B')!.grammar).toBeNull();
    expect([5, 15]).toContain(result.get('C')!.grammar);
  });
});

describe('headlineText', () => {
  it('headline_keeps_the_two_largest_changes', () => {
    expect(headlineText(deltas({ grammar: 4, fluency: 1, pronunciation: -2 }))).toBe('Grammar +4 · Pronunciation −2');
    expect(headlineText(deltas({ vocabulary: -7, comprehension: 3, interaction: 1, grammar: 2 }))).toBe(
      'Vocabulary −7 · Comprehension +3',
    );
  });

  it('ties_break_in_the_fixed_competency_order', () => {
    expect(headlineText(deltas({ pronunciation: 3, comprehension: -3, interaction: 3 }))).toBe(
      'Interaction +3 · Comprehension −3',
    );
    expect(
      headlineText({ grammar: 2, vocabulary: 2, fluency: 2, interaction: 2, comprehension: 2, pronunciation: 2 }),
    ).toBe('Grammar +2 · Vocabulary +2');
  });

  it('first_result_and_no_change_have_their_own_sentences', () => {
    expect(
      headlineText({ grammar: null, vocabulary: null, fluency: null, interaction: null, comprehension: null, pronunciation: null }),
    ).toBe('Your first result');
    expect(headlineText(deltas({}))).toBe('No change since your previous lesson');
    // Zeros beside unmeasured pronunciation are still "no change", not a first result.
    expect(headlineText(deltas({ pronunciation: null }))).toBe('No change since your previous lesson');
  });

  it('a_single_change_renders_alone', () => {
    expect(headlineText(deltas({ fluency: 5 }))).toBe('Fluency +5');
    expect(headlineText(deltas({ grammar: null, pronunciation: -1 }))).toBe('Pronunciation −1');
  });
});
