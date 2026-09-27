import { describe, expect, it } from 'vitest';

import { evaluateGate, type GateContext } from '../../src/generation/gate/difficulty-gate';
import type { GateCheckName, GeneratedItemOutput, SlotSpec } from '../../src/generation/generation.contract';
import { mapGeneratedOutput } from '../../src/generation/generated-item.mapper';
import { buildFrequencyList } from '../../src/generation/text/frequency-list';
import { committedGateData, loadFixture, responseForSlot, slotSpec } from '../fixtures/generation/fixtures';

const data = committedGateData();

function gate(output: GeneratedItemOutput, slot: SlotSpec, overrides: Partial<GateContext> = {}) {
  const mapped = mapGeneratedOutput(output, slot, { promptId: `${slot.type}-generate`, promptVersion: '2' }, data.rules.rules, data.taxonomy);
  return evaluateGate(mapped, {
    slot,
    rules: data.rules,
    frequencyList: data.frequencyList,
    taxonomy: data.taxonomy,
    promptBannedPhrases: [],
    learnerQuotes: [],
    ...overrides,
  });
}

function checkOf(output: GeneratedItemOutput, slot: SlotSpec, check: GateCheckName, overrides: Partial<GateContext> = {}) {
  return gate(output, slot, overrides).metrics.checks[check];
}

const readingSlot = slotSpec();
const reading = (): GeneratedItemOutput => responseForSlot('reading', readingSlot.targetTags);

/** `sentences` sentences of `wordsEach` words each, from a pool wide enough to keep the other measures sane. */
function syntheticBody(wordsPerSentence: number[]): string {
  const pool = 'council library budget decision visitors evidence survey closure figures residents saving building'.split(' ');
  let next = 0;
  return wordsPerSentence
    .map((count) => {
      const sentenceWords = Array.from({ length: count }, () => pool[next++ % pool.length]!);
      const text = sentenceWords.join(' ');
      return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
    })
    .join(' ');
}

function withBody(body: string): GeneratedItemOutput {
  return { ...reading(), body };
}

describe('difficulty gate', () => {
  it('a_valid_reading_passes_every_check', () => {
    const report = gate(reading(), readingSlot);

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(Object.values(report.metrics.checks)).toEqual(Array(10).fill('pass'));
    expect(report.item?.gateMetrics).toMatchObject({ rules_version: '1', attempt: 1, genre: 'letter to the editor' });
    expect((report.item?.gateMetrics as { answer_evidence: string[] }).answer_evidence).toHaveLength(5);
  });

  it('reading_word_count_boundaries', () => {
    // Twenty-word sentences keep the mean inside 18–26 while the length crosses the limits.
    const withWords = (total: number) => withBody(syntheticBody([...Array(Math.floor(total / 20)).fill(20), total % 20 || 0].filter(Boolean)));

    expect(checkOf(withWords(449), readingSlot, 'word_count')).toBe('fail');
    expect(checkOf(withWords(450), readingSlot, 'word_count')).toBe('pass');
    expect(checkOf(withWords(700), readingSlot, 'word_count')).toBe('pass');
    expect(checkOf(withWords(701), readingSlot, 'word_count')).toBe('fail');
  });

  it('reading_mean_sentence_length_boundaries', () => {
    const tenSentences = (total: number) => {
      const base = Math.floor(total / 10);
      return withBody(syntheticBody(Array.from({ length: 10 }, (_, index) => base + (index < total % 10 ? 1 : 0))));
    };

    expect(checkOf(tenSentences(179), readingSlot, 'mean_sentence_length')).toBe('fail');
    expect(checkOf(tenSentences(180), readingSlot, 'mean_sentence_length')).toBe('pass');
    expect(checkOf(tenSentences(260), readingSlot, 'mean_sentence_length')).toBe('pass');
    expect(checkOf(tenSentences(261), readingSlot, 'mean_sentence_length')).toBe('fail');
  });

  it('fails_below_12_percent_outside_the_top_3000', () => {
    // A controlled list: `common` is ranked, `rarity` is not, so the ratio is exactly rare / total.
    const list = buildFrequencyList(new Map([['common', 1]]), 'test');
    const bodyWith = (rare: number) =>
      withBody(`${Array(rare).fill('rarity').concat(Array(1000 - rare).fill('common')).join(' ')}.`);

    expect(checkOf(bodyWith(119), readingSlot, 'out_of_frequency_ratio', { frequencyList: list })).toBe('fail');
    expect(checkOf(bodyWith(120), readingSlot, 'out_of_frequency_ratio', { frequencyList: list })).toBe('pass');
  });

  it('fails_below_the_type_token_ratio', () => {
    const report = gate(withBody(syntheticBody(Array(25).fill(20))), readingSlot);

    expect(report.metrics.type_token_ratio).toBeLessThan(0.45);
    expect(report.failedChecks).toContain('type_token_ratio');
  });

  it('fails_on_a_banned_phrase_from_the_rules_or_the_prompt', () => {
    const insert = (phrase: string) => {
      const output = reading();
      return { ...output, body: output.body.replace('I would gently dispute both claims.', `I would gently dispute both claims, ${phrase}.`) };
    };

    const fromRules = gate(insert('it is worth noting'), readingSlot);
    expect(fromRules.failedChecks).toContain('banned_phrases');
    expect(fromRules.metrics.banned_phrases_found).toEqual([{ phrase: 'it is worth noting', count: 1 }]);

    expect(checkOf(insert('in today’s   fast-paced world'), readingSlot, 'banned_phrases')).toBe('fail');
    expect(checkOf(reading(), readingSlot, 'banned_phrases', { promptBannedPhrases: ['quietly revealing'] })).toBe('fail');
    // `delved into` is not the phrase `delve into`.
    expect(checkOf(insert('which reporters delved into'), readingSlot, 'banned_phrases')).toBe('pass');
  });

  it('fails_with_fewer_than_three_occurrences_of_a_required_structure', () => {
    const slot = slotSpec({ targetTags: ['grammar:conditional-3'] });
    const all = responseForSlot('reading', slot.targetTags);
    const keep = (count: number) => ({ ...all, target_occurrences: all.target_occurrences.slice(0, count) });

    const two = gate(keep(2), slot);
    expect(two.failedChecks).toEqual(['target_structures']);
    expect(two.metrics.target_structures['grammar:conditional-3']?.occurrences).toBe(2);
    expect(checkOf(keep(3), slot, 'target_structures')).toBe('pass');
  });

  it('fails_when_questions_are_not_exactly_five', () => {
    const output = reading();
    const four = { ...output, questions: output.questions.slice(0, 4) };
    const six = { ...output, questions: [...output.questions, output.questions[0]!] };

    expect(checkOf(four, readingSlot, 'questions')).toBe('fail');
    expect(checkOf(six, readingSlot, 'questions')).toBe('fail');
  });

  it('fails_when_a_question_has_no_single_correct_answer', () => {
    const output = reading();
    const notAmongOptions = structuredClone(output);
    notAmongOptions.questions[0]!.answer = 'Published nothing';
    const duplicateOptions = structuredClone(output);
    duplicateOptions.questions[0]!.options = ['Sold the building', 'sold the building ', 'Published its footfall figures', 'Increased the library budget'];

    const missing = gate(notAmongOptions, readingSlot);
    expect(missing.failedChecks).toContain('questions');
    expect(missing.failures.find((failure) => failure.check === 'questions')).toMatchObject({
      issues: expect.arrayContaining(['/questions/0/answer must be one of /questions/0/options']),
    });
    expect(checkOf(duplicateOptions, readingSlot, 'questions')).toBe('fail');
  });

  it('fails_a_format_outside_multiple_choice_and_fill_blank', () => {
    const output = reading();
    output.questions[1] = { ...output.questions[1]!, format: 'ordering' };

    expect(checkOf(output, readingSlot, 'questions')).toBe('fail');
  });

  it('fails_when_evidence_is_not_in_the_text_or_too_short', () => {
    const invented = reading();
    invented.questions[0]!.evidence = 'The council published everything in advance of the vote';
    const short = reading();
    short.questions[1]!.evidence = 'only borrowers';

    expect(checkOf(invented, readingSlot, 'answer_evidence')).toBe('fail');
    expect(checkOf(short, readingSlot, 'answer_evidence')).toBe('fail');
  });

  it('fails_a_fill_blank_whose_evidence_lacks_an_accepted_answer', () => {
    const output = reading();
    output.questions[2]!.evidence = 'households least able to absorb it';

    expect(checkOf(output, readingSlot, 'answer_evidence')).toBe('fail');
  });

  it('fails_when_a_learner_quote_or_correction_is_reproduced', () => {
    const output = reading();
    output.body = output.body.replace('On a wet Tuesday afternoon', 'We visited the old harbour museum at dawn, and on a wet Tuesday afternoon');
    const fiveWordsOnly = reading();
    fiveWordsOnly.body = fiveWordsOnly.body.replace('On a wet Tuesday afternoon', 'The old harbour museum at noon was shut, and on a wet Tuesday afternoon');

    const quote = 'we visited the old harbour museum at dawn';
    expect(checkOf(output, readingSlot, 'learner_quotes', { learnerQuotes: [quote] })).toBe('fail');
    expect(checkOf(fiveWordsOnly, readingSlot, 'learner_quotes', { learnerQuotes: [quote] })).toBe('pass');
    expect(checkOf(output, readingSlot, 'learner_quotes', { learnerQuotes: ['I go there. We visited the old harbour museum at dawn yesterday.'] })).toBe('fail');
    expect(gate(output, readingSlot, { learnerQuotes: [quote] }).failures).toContainEqual({ check: 'learner_quotes', reproduced: 1 });
  });

  it('short_item_types_use_their_own_word_range', () => {
    const grammarSlot = slotSpec({ type: 'grammar', targetTags: ['grammar:passive-voice'] });

    expect(gate(responseForSlot('grammar', grammarSlot.targetTags), grammarSlot).passed).toBe(true);
    const longText = { ...responseForSlot('grammar', grammarSlot.targetTags), body: loadFixture('reading-library-letter').body };
    expect(checkOf(longText, grammarSlot, 'word_count')).toBe('fail');
  });

  it('reports_every_failed_check_not_just_the_first', () => {
    const output = reading();
    output.questions = output.questions.slice(0, 4);
    output.body = `${output.body} In conclusion, the matter is settled.`;
    output.questions[0]!.evidence = 'never written anywhere in this letter';

    expect(gate(output, readingSlot).failedChecks).toEqual(['banned_phrases', 'questions', 'answer_evidence']);
  });

  it('records_metrics_even_when_the_gate_fails', () => {
    const report = gate(withBody(syntheticBody([5, 5])), readingSlot);

    expect(report.passed).toBe(false);
    expect(report.item).toBeNull();
    expect(report.metrics).toMatchObject({ word_count: 10, sentence_count: 2, mean_sentence_length: 5, questions: 5 });
    expect(report.metrics.checks.word_count).toBe('fail');
  });

  it('fixture_metrics_are_pinned', () => {
    // A change to the frequency list or the tokeniser that moves these is worth noticing: bump the rules version.
    expect(gate(reading(), readingSlot).metrics).toMatchObject({
      word_count: 491,
      sentence_count: 22,
      mean_sentence_length: 22.32,
      type_token_ratio: 0.574,
      out_of_frequency_ratio: 0.125,
    });
    const grammarSlot = slotSpec({ type: 'grammar', targetTags: ['grammar:passive-voice'] });
    expect(gate(responseForSlot('grammar', grammarSlot.targetTags), grammarSlot).metrics).toMatchObject({
      word_count: 278,
      sentence_count: 12,
      mean_sentence_length: 23.17,
      type_token_ratio: 0.622,
      out_of_frequency_ratio: 0.133,
    });
  });
});
