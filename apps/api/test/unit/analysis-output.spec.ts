import { describe, expect, it } from 'vitest';

import {
  matchQuote,
  normalizeForMatch,
  processAnalysisOutput,
  type OwnUtterance,
  type ProcessAnalysisOutputOptions,
  type RawAnalysisError,
  type RawAnalysisOutput,
} from '../../src/analysis/analysis-output';

const OWN: OwnUtterance[] = [
  { id: 'u1', text: "If I would have known about the storm, I would have booked an earlier connection." },
  { id: 'u2', text: 'I would feel more comfortable if we could sort this out today, to be honest.' },
  { id: 'u3', text: 'With all due respect, I think the airline owes passengers more than a voucher.' },
];

function error(overrides: Partial<RawAnalysisError> = {}): RawAnalysisError {
  return {
    quote: OWN[0]!.text,
    tag: 'grammar:conditional-3',
    correction: 'If I had known about the storm, I would have booked an earlier connection.',
    explanation: 'Use the past perfect in the if-clause of a third conditional.',
    severity: 'moderate',
    ...overrides,
  };
}

function baseRaw(overrides: Partial<RawAnalysisOutput> = {}): RawAnalysisOutput {
  return {
    competencies: {
      grammar: { score: 60, justification: 'x' },
      vocabulary: { score: 60, justification: 'x' },
      fluency: { score: 60, justification: 'x' },
      interaction: { score: 60, justification: 'x' },
      comprehension: { score: 60, justification: 'x' },
    },
    strengths: ['a', 'b', 'c'],
    errors: [],
    recurring_tags: [],
    scenario_fit: null,
    topics_to_practice: ['a', 'b', 'c'],
    ...overrides,
  };
}

const CARD_EXPRESSIONS = [
  'to be on the safe side',
  'I would feel more comfortable if',
  'with all due respect',
  'let us be realistic',
  'the bottom line is',
  'no offense, but',
];

function baseOptions(overrides: Partial<ProcessAnalysisOutputOptions> = {}): ProcessAnalysisOutputOptions {
  return {
    raw: baseRaw(),
    ownUtterances: OWN,
    scenarioContext: 'none',
    roleLabel: null,
    registerExpected: null,
    cardTargetExpressions: [],
    profileTags: [],
    lessonDurationSeconds: 300,
    maxErrors: 25,
    ...overrides,
  };
}

describe('normalizeForMatch', () => {
  it('straightens_curly_quotes_and_strips_punctuation', () => {
    expect(normalizeForMatch('“I’ve went there,”')).toBe(normalizeForMatch("i've went there"));
  });
});

describe('matchQuote', () => {
  it('keeps_verbatim_quotes_with_their_utterance', () => {
    const result = matchQuote(OWN[1]!.text, OWN);
    expect(result.matched).toBe(true);
    expect(result.utteranceId).toBe('u2');
  });

  it('normalizes_case_punctuation_and_curly_quotes', () => {
    const result = matchQuote('“I would feel more comfortable if we could sort this out today, to be honest.”', OWN);
    expect(result.matched).toBe(true);
    expect(result.utteranceId).toBe('u2');
  });

  it('matches_across_two_consecutive_own_utterances', () => {
    const split: OwnUtterance[] = [
      { id: 'a', text: 'I would feel more comfortable' },
      { id: 'b', text: 'if we could sort this out today.' },
    ];
    const result = matchQuote('I would feel more comfortable if we could sort this out today', split);
    expect(result.matched).toBe(true);
    expect(result.utteranceId).toBe('a');
  });

  it('matches_ellipsis_fragments_in_order', () => {
    const result = matchQuote('If I would have known ... booked an earlier connection', OWN);
    expect(result.matched).toBe(true);
    expect(result.utteranceId).toBe('u1');
  });

  it('does_not_match_out_of_order_ellipsis_fragments', () => {
    const result = matchQuote('booked an earlier connection ... If I would have known', OWN);
    expect(result.matched).toBe(false);
  });

  it('does_not_match_a_paraphrase', () => {
    const result = matchQuote('If I had known about the weather I would have left sooner', OWN);
    expect(result.matched).toBe(false);
    expect(result.utteranceId).toBeNull();
  });

  it('does_not_match_another_participants_words', () => {
    const result = matchQuote('a sentence only the other participant said', OWN);
    expect(result.matched).toBe(false);
  });
});

describe('processAnalysisOutput', () => {
  it('keeps_verbatim_quotes_with_their_utterance', () => {
    const result = processAnalysisOutput(baseOptions({ raw: baseRaw({ errors: [error()] }) }));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.utteranceId).toBe('u1');
    expect(result.discardedErrorCount).toBe(0);
  });

  it('discards_quotes_not_in_the_owners_utterances', () => {
    const paraphrased = error({ quote: 'I had not known it would storm, so I would have booked sooner' });
    const othersWords = error({ quote: 'a sentence only the other participant said', tag: 'vocab:register' });
    const result = processAnalysisOutput(baseOptions({ raw: baseRaw({ errors: [paraphrased, othersWords] }) }));

    expect(result.errors).toHaveLength(0);
    expect(result.discardedErrorCount).toBe(2);
  });

  it('collapses_duplicate_quote_and_tag_pairs', () => {
    const raw = baseRaw({ errors: [error(), error()] });
    const result = processAnalysisOutput(baseOptions({ raw }));
    expect(result.errors).toHaveLength(1);
    expect(result.discardedErrorCount).toBe(0);
  });

  it('caps_errors_at_maxErrors_before_matching', () => {
    const many = Array.from({ length: 5 }, (_, i) => error({ quote: OWN[i % OWN.length]!.text, tag: `grammar:pronoun` }));
    const result = processAnalysisOutput(baseOptions({ raw: baseRaw({ errors: many }), maxErrors: 2 }));
    // Only the first 2 are ever considered — the rest are neither kept nor discarded.
    expect(result.errors.length + result.discardedErrorCount).toBeLessThanOrEqual(2);
  });

  it('recurring_tags_need_a_kept_error_and_a_profile_tag', () => {
    const raw = baseRaw({ errors: [error({ tag: 'grammar:conditional-3' })], recurring_tags: ['grammar:conditional-3', 'vocab:register'] });
    const withProfile = processAnalysisOutput(
      baseOptions({ raw, profileTags: ['grammar:conditional-3'] }),
    );
    expect(withProfile.recurringTags).toEqual(['grammar:conditional-3']);

    const withoutProfile = processAnalysisOutput(baseOptions({ raw, profileTags: [] }));
    expect(withoutProfile.recurringTags).toEqual([]);

    const wrongTagInProfile = processAnalysisOutput(
      baseOptions({ raw, profileTags: ['vocab:register'] }),
    );
    // vocab:register is a profile tag but was never a KEPT error's tag.
    expect(wrongTagInProfile.recurringTags).toEqual([]);
  });

  it('partitions_the_cards_expressions_into_used_and_not_used', () => {
    const raw = baseRaw({
      scenario_fit: {
        register_matched: true,
        register_comment: 'Consistent throughout.',
        expressions_attempted: [
          'with all due respect',
          'I would feel more comfortable if',
          'an expression not on the card',
        ],
      },
    });
    const result = processAnalysisOutput(
      baseOptions({
        raw,
        scenarioContext: 'full',
        roleLabel: 'The Traveler',
        registerExpected: 'neutral',
        cardTargetExpressions: CARD_EXPRESSIONS,
      }),
    );

    expect(result.scenarioFit).not.toBeNull();
    expect(result.scenarioFit!.expressionsUsed).toEqual(['I would feel more comfortable if', 'with all due respect']);
    expect(result.scenarioFit!.expressionsNotUsed).toEqual([
      'to be on the safe side',
      'let us be realistic',
      'the bottom line is',
      'no offense, but',
    ]);
    // Together they partition the card exactly.
    const union = [...result.scenarioFit!.expressionsUsed, ...result.scenarioFit!.expressionsNotUsed].sort();
    expect(union).toEqual([...CARD_EXPRESSIONS].sort());
    expect(result.scenarioFit!.roleLabel).toBe('The Traveler');
    expect(result.scenarioFit!.registerExpected).toBe('neutral');
    expect(result.curatorFlags).not.toContain('scenario_fit_missing');
  });

  it('fit_is_null_without_a_full_scenario', () => {
    const raw = baseRaw({
      scenario_fit: { register_matched: true, register_comment: 'x', expressions_attempted: ['with all due respect'] },
    });
    const situationOnly = processAnalysisOutput(
      baseOptions({ raw, scenarioContext: 'situation_only', cardTargetExpressions: CARD_EXPRESSIONS }),
    );
    expect(situationOnly.scenarioFit).toBeNull();
    expect(situationOnly.curatorFlags).not.toContain('scenario_fit_missing');

    const none = processAnalysisOutput(baseOptions({ raw, scenarioContext: 'none' }));
    expect(none.scenarioFit).toBeNull();
    expect(none.curatorFlags).not.toContain('scenario_fit_missing');
  });

  it('a_missing_fit_with_a_full_scenario_is_flagged', () => {
    const raw = baseRaw({ scenario_fit: null });
    const result = processAnalysisOutput(
      baseOptions({
        raw,
        scenarioContext: 'full',
        roleLabel: 'The Traveler',
        registerExpected: 'neutral',
        cardTargetExpressions: CARD_EXPRESSIONS,
      }),
    );
    expect(result.scenarioFit).toBeNull();
    expect(result.curatorFlags).toContain('scenario_fit_missing');
  });

  it('zero_errors_on_a_long_lesson_is_flagged', () => {
    const result = processAnalysisOutput(baseOptions({ raw: baseRaw({ errors: [] }), lessonDurationSeconds: 11 * 60 }));
    expect(result.curatorFlags).toContain('no_errors_long_lesson');
  });

  it('zero_errors_on_a_short_lesson_is_not_flagged', () => {
    const result = processAnalysisOutput(baseOptions({ raw: baseRaw({ errors: [] }), lessonDurationSeconds: 9 * 60 }));
    expect(result.curatorFlags).not.toContain('no_errors_long_lesson');
  });

  it('every_kept_error_discarded_on_a_long_lesson_is_also_flagged', () => {
    const raw = baseRaw({ errors: [error({ quote: 'a sentence only the other participant said' })] });
    const result = processAnalysisOutput(baseOptions({ raw, lessonDurationSeconds: 11 * 60 }));
    expect(result.errors).toHaveLength(0);
    expect(result.curatorFlags).toContain('no_errors_long_lesson');
  });
});
