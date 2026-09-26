import {
  curatedItemMetaSchemaFor,
  generatedItemInputSchema,
  questionSchema,
  type ImportableContentType,
} from '@english-quest/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  fiveQuestions,
  fillBlank,
  generatedInput,
  grammarMeta,
  listeningMeta,
  matching,
  multipleChoice,
  ordering,
  readingMeta,
  vocabularyMeta,
} from '../integration/helpers/content-fixtures';

/** Every issue as `dotted.path: message`, so assertions read like the report. */
function issues(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

function metaIssues(type: ImportableContentType, value: unknown): string[] {
  return issues(curatedItemMetaSchemaFor(type), value);
}

/** Five valid questions with the one at `index` replaced. */
function withQuestion(index: number, question: Record<string, unknown>): Record<string, unknown>[] {
  const questions = fiveQuestions();
  questions[index] = question;
  return questions;
}

describe('content item schema (shared)', () => {
  it('accepts_a_valid_listening_meta', () => {
    const parsed = curatedItemMetaSchemaFor('listening').parse(listeningMeta());
    expect(parsed.accent).toBe('british');
    expect(parsed.questions).toHaveLength(5);
    expect(parsed.target_tags).toEqual(['vocab:collocation', 'discourse:connector']);
  });

  it('accepts_each_question_format', () => {
    for (const question of [multipleChoice(), fillBlank(), ordering(), matching()]) {
      expect(issues(questionSchema, question)).toEqual([]);
    }
    expect(metaIssues('listening', listeningMeta())).toEqual([]);
  });

  it('rejects_a_multiple_choice_answer_not_among_options', () => {
    const meta = listeningMeta({ questions: withQuestion(2, multipleChoice({ answer: 'Something else' })) });
    expect(metaIssues('listening', meta)).toEqual(['questions.2.answer: must be one of /questions/2/options']);
  });

  it('rejects_duplicate_multiple_choice_options', () => {
    const question = multipleChoice({ options: ['Who bears the cost', ' who bears THE cost', 'C', 'D'] });
    expect(metaIssues('listening', listeningMeta({ questions: withQuestion(0, question) }))).toContain(
      'questions.0.options: must not contain duplicates',
    );
  });

  it('rejects_other_than_exactly_five_questions', () => {
    const four = fiveQuestions().slice(0, 4);
    const six = [...fiveQuestions(), multipleChoice()];
    expect(metaIssues('listening', listeningMeta({ questions: four }))).toEqual([
      'questions: must contain exactly 5 questions',
    ]);
    expect(metaIssues('listening', listeningMeta({ questions: six }))).toEqual([
      'questions: must contain exactly 5 questions',
    ]);
  });

  it('rejects_a_fill_blank_prompt_without_exactly_one_blank', () => {
    for (const prompt of ['No blank here.', 'Two ___ blanks ____ here.']) {
      expect(issues(questionSchema, fillBlank({ prompt }))).toEqual(['prompt: must contain exactly one blank (___)']);
    }
    expect(issues(questionSchema, fillBlank({ prompt: 'A longer _____ blank counts once.' }))).toEqual([]);
  });

  it('rejects_an_ordering_answer_that_is_not_a_permutation', () => {
    for (const answer of [[2, 0], [2, 0, 0], [2, 0, 3]]) {
      const meta = listeningMeta({ questions: withQuestion(2, ordering({ answer })) });
      expect(metaIssues('listening', meta)).toEqual([
        'questions.2.answer: must be a permutation of the indexes of /questions/2/segments',
      ]);
    }
  });

  it('rejects_an_ordering_or_matching_answer_equal_to_the_displayed_order', () => {
    const orderingMeta = listeningMeta({ questions: withQuestion(2, ordering({ answer: [0, 1, 2] })) });
    const matchingMeta = listeningMeta({ questions: withQuestion(3, matching({ answer: [0, 1, 2] })) });
    expect(metaIssues('listening', orderingMeta)).toEqual(['questions.2.answer: must differ from the displayed order']);
    expect(metaIssues('listening', matchingMeta)).toEqual(['questions.3.answer: must differ from the displayed order']);
  });

  it('rejects_a_matching_answer_that_is_not_a_bijection', () => {
    for (const answer of [[1, 1, 0], [1, 2], [1, 2, 3]]) {
      const meta = listeningMeta({ questions: withQuestion(3, matching({ answer })) });
      expect(metaIssues('listening', meta)).toEqual([
        'questions.3.answer: must pair every left item with exactly one right item',
      ]);
    }
    const uneven = matching({ right: ['a', 'b', 'c', 'd'] });
    expect(issues(questionSchema, uneven)).toEqual(['right: must have as many items as left']);
  });

  it('rejects_an_empty_explanation', () => {
    for (const build of [multipleChoice, fillBlank, ordering, matching]) {
      expect(issues(questionSchema, build({ explanation: '   ' }))).toEqual(['explanation: must not be empty']);
      const { explanation: _explanation, ...missing } = build();
      expect(issues(questionSchema, missing)).toHaveLength(1);
      expect(issues(questionSchema, missing)[0]).toMatch(/^explanation: /);
    }
  });

  it('requires_accent_for_listening_and_forbids_it_elsewhere', () => {
    const { accent: _accent, ...withoutAccent } = listeningMeta();
    expect(metaIssues('listening', withoutAccent)).toHaveLength(1);
    expect(metaIssues('listening', withoutAccent)[0]).toMatch(/^accent: /);
    expect(metaIssues('listening', listeningMeta({ accent: 'UK' }))[0]).toMatch(/^accent: /);

    for (const type of ['reading', 'vocabulary', 'grammar'] as const) {
      const meta = { reading: readingMeta, vocabulary: vocabularyMeta, grammar: grammarMeta }[type]({ accent: 'british' });
      expect(metaIssues(type, meta)).toEqual(['accent: is only allowed for listening items']);
    }
  });

  it('requires_body_for_listening_and_reading_only', () => {
    const { body: _listeningBody, ...listeningWithout } = listeningMeta();
    const { body: _readingBody, ...readingWithout } = readingMeta();
    expect(metaIssues('listening', listeningWithout)[0]).toMatch(/^body: /);
    expect(metaIssues('reading', readingWithout)[0]).toMatch(/^body: /);
    expect(metaIssues('vocabulary', vocabularyMeta())).toEqual([]);
    expect(metaIssues('grammar', grammarMeta())).toEqual([]);
  });

  it('requires_the_type_skill_in_skills', () => {
    expect(metaIssues('listening', listeningMeta({ skills: ['vocabulary'] }))).toEqual([
      'skills: must include "listening"',
    ]);
    expect(metaIssues('reading', readingMeta({ skills: ['reading', 'reading'] }))).toEqual([
      'skills: must not contain duplicates',
    ]);
  });

  it('rejects_empty_duplicate_or_too_many_target_tags', () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => `vocab:tag-${index}`);
    expect(metaIssues('listening', listeningMeta({ target_tags: [] }))).toEqual([
      'target_tags: must contain at least 1 tag',
    ]);
    expect(metaIssues('listening', listeningMeta({ target_tags: ['vocab:collocation', 'vocab:collocation'] }))).toEqual([
      'target_tags: must not contain duplicates',
    ]);
    expect(metaIssues('listening', listeningMeta({ target_tags: tooMany }))).toEqual([
      'target_tags: must contain at most 10 tags',
    ]);
    expect(metaIssues('listening', listeningMeta({ target_tags: [`vocab:${'x'.repeat(59)}`] }))).toEqual([
      'target_tags.0: must be at most 64 characters',
    ]);
  });

  it('rejects_unknown_keys', () => {
    const result = curatedItemMetaSchemaFor('listening').safeParse(listeningMeta({ dificulty: 3 }));
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((entry) => entry.code === 'unrecognized_keys');
    expect(issue).toMatchObject({ keys: ['dificulty'] });
  });

  it('generated_schema_rejects_listening', () => {
    expect(issues(generatedItemInputSchema, generatedInput({ type: 'listening' }))).toEqual([
      'type: must be one of reading, vocabulary, grammar, error_review (listening is never generated)',
    ]);
    expect(issues(generatedItemInputSchema, generatedInput())).toEqual([]);
  });

  it('generated_schema_requires_prompt_stamp_and_gate_metrics', () => {
    const { promptId: _id, promptVersion: _version, gateMetrics: _metrics, ...unstamped } = generatedInput();
    const reported = issues(generatedItemInputSchema, unstamped).map((issue) => issue.split(':')[0]);
    expect(reported).toEqual(['promptId', 'promptVersion', 'gateMetrics']);
    expect(issues(generatedItemInputSchema, generatedInput({ gateMetrics: {} }))).toEqual([
      'gateMetrics: must not be empty',
    ]);
  });
});
