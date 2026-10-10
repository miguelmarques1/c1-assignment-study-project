import { describe, expect, it } from 'vitest';

import { checkAll, checkQuestion, isRunnable } from '../../src/activities/objective/question-check';
import { projectQuestion, questionsFingerprint, splitBlank } from '../../src/activities/objective/question-projection';
import { fillQuestion, matchingQuestion, mcQuestion, orderingQuestion, validQuestions } from './objective-test-data';

describe('question checks', () => {
  it('multiple_choice_and_fill_blank_are_scorable', () => {
    expect(checkQuestion(mcQuestion(), 0).scorable).toBe(true);
    expect(checkQuestion(fillQuestion(), 1).scorable).toBe(true);
  });

  it('ordering_and_matching_are_unscored_until_the_full_scope', () => {
    for (const raw of [orderingQuestion(), matchingQuestion()]) {
      const check = checkQuestion(raw, 4);
      expect(check).toMatchObject({ scorable: false, reason: 'format_unavailable', prompt: raw.prompt });
    }
  });

  it('an_answer_outside_the_options_is_an_invalid_key', () => {
    const check = checkQuestion(mcQuestion({ answer: 'Not an option' }), 2);
    expect(check).toMatchObject({ scorable: false, reason: 'answer_key_invalid' });
    if (!check.scorable) {
      expect(check.issues.join(' ')).toContain('/questions/2/options');
    }
  });

  it('a_fill_blank_without_one_blank_is_an_invalid_key', () => {
    const check = checkQuestion(fillQuestion({ prompt: 'Two ___ blanks ___ here.' }), 1);
    expect(check).toMatchObject({ scorable: false, reason: 'answer_key_invalid', prompt: 'Two ___ blanks ___ here.' });
  });

  it('an_item_with_no_scorable_question_is_not_runnable', () => {
    const checks = checkAll(Array.from({ length: 5 }, () => ({ format: 'multiple_choice', prompt: 'x' })));
    expect(checks.every((check) => !check.scorable)).toBe(true);
    expect(isRunnable(checks)).toBe(false);
    expect(isRunnable(checkAll(validQuestions()))).toBe(true);
    expect(checkAll('not an array')).toEqual([]);
  });

  it('projection_never_carries_an_answer_or_explanation', () => {
    const checks = checkAll([...validQuestions().slice(0, 4), orderingQuestion()]);
    const json = JSON.stringify(checks.map(projectQuestion));
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('"explanation"');
    expect(json).not.toContain('accepted');
    expect(json).not.toContain('had listened to');
    expect(json).not.toContain('The second paragraph');
    expect(checks.map(projectQuestion).map((view) => view.format)).toEqual(['multiple_choice', 'fill_blank', 'multiple_choice', 'fill_blank', 'unscored']);
  });

  it('the_blank_is_split_and_sized_to_the_longest_accepted_answer', () => {
    const view = projectQuestion(checkQuestion(fillQuestion({ answer: ['had', 'had listened to'] }), 1));
    expect(view).toMatchObject({ before: 'If the council ', after: ' the tenants, the scheme would have survived.', blankLength: 15 });
    expect(splitBlank('___ went home')).toEqual({ before: '', after: ' went home' });
    const short = projectQuestion(checkQuestion(fillQuestion({ answer: ['a'] }), 1));
    expect(short).toMatchObject({ blankLength: 4 });
    const long = projectQuestion(checkQuestion(fillQuestion({ answer: ['x'.repeat(60)] }), 1));
    expect(long).toMatchObject({ blankLength: 40 });
  });

  it('the_fingerprint_ignores_key_order_and_changes_with_content', () => {
    const a = [{ format: 'fill_blank', prompt: 'p ___', answer: ['x'], explanation: 'e' }];
    const reordered = [{ explanation: 'e', answer: ['x'], prompt: 'p ___', format: 'fill_blank' }];
    const edited = [{ format: 'fill_blank', prompt: 'p ___ q', answer: ['x'], explanation: 'e' }];
    expect(questionsFingerprint(a)).toBe(questionsFingerprint(reordered));
    expect(questionsFingerprint(a)).not.toBe(questionsFingerprint(edited));
    expect(questionsFingerprint(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
