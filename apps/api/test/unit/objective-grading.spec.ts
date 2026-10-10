import type { ObjectiveAnswer } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { answerIssues, grade } from '../../src/activities/objective/grading';
import { checkAll } from '../../src/activities/objective/question-check';
import { resultView } from '../../src/activities/objective/result-view';
import { fillQuestion, mcQuestion, orderingQuestion, validQuestions } from './objective-test-data';

const mc = (index: number, optionIndex: number): ObjectiveAnswer => ({ index, format: 'multiple_choice', optionIndex });
const fill = (index: number, text: string): ObjectiveAnswer => ({ index, format: 'fill_blank', text });
const allRight: ObjectiveAnswer[] = [mc(0, 1), fill(1, 'had listened to'), mc(2, 1), fill(3, 'Had'), mc(4, 1)];

describe('objective grading', () => {
  it('grades_multiple_choice_by_option_index', () => {
    const checks = checkAll(validQuestions());
    const graded = grade(checks, [mc(0, 1), fill(1, 'had listened to'), mc(2, 0), fill(3, 'Had'), mc(4, 1)]);
    expect(graded.results.map((result) => result.outcome)).toEqual(['correct', 'correct', 'incorrect', 'correct', 'correct']);
  });

  it('grades_fill_blank_with_normalization', () => {
    const checks = checkAll([fillQuestion({ answer: ["hadn't"] }), ...validQuestions().slice(1)]);
    const graded = grade(checks, [fill(0, `Hadn${String.fromCharCode(0x2019)}t`), fill(1, '  had listened to '), mc(2, 1), fill(3, 'had'), mc(4, 1)]);
    expect(graded.results[0]?.outcome).toBe('correct');
    expect(graded.results[1]?.outcome).toBe('correct');
  });

  it('scores_over_scorable_questions_only', () => {
    const checks = checkAll([...validQuestions().slice(0, 4), orderingQuestion()]);
    const graded = grade(checks, [mc(0, 1), fill(1, 'had listened to'), mc(2, 1), fill(3, 'wrong')]);
    expect(graded).toMatchObject({ scoreCorrect: 3, scoreTotal: 4, unscoredCount: 1 });
    expect(graded.results[4]).toMatchObject({ outcome: 'unscored', unscoredReason: 'format_unavailable' });
  });

  it('rejects_a_missing_or_duplicate_answer', () => {
    const checks = checkAll(validQuestions());
    const missing = answerIssues(checks, allRight.slice(0, 4));
    expect(missing).toEqual([{ path: 'answers.4', message: 'is missing' }]);
    const duplicate = answerIssues(checks, [...allRight, mc(0, 1)]);
    expect(duplicate.map((issue) => issue.path)).toEqual(['answers.0']);
    expect(answerIssues(checks, allRight)).toEqual([]);
  });

  it('rejects_an_answer_to_an_unscored_question', () => {
    const checks = checkAll([...validQuestions().slice(0, 4), orderingQuestion()]);
    const issues = answerIssues(checks, [...allRight.slice(0, 4), mc(4, 0)]);
    expect(issues).toEqual([{ path: 'answers.4', message: 'answers a question that is not scored' }]);
  });

  it('rejects_a_format_mismatch_and_out_of_range_values', () => {
    const checks = checkAll(validQuestions());
    const mismatch = answerIssues(checks, [fill(0, 'x'), ...allRight.slice(1)]);
    expect(mismatch).toEqual([{ path: 'answers.0', message: 'must be a multiple_choice answer' }]);
    const range = answerIssues(checks, [mc(0, 4), ...allRight.slice(1)]);
    expect(range).toEqual([{ path: 'answers.0', message: 'optionIndex is out of range' }]);
    expect(answerIssues(checks, [...allRight.slice(0, 4), mc(7, 0)]).map((issue) => issue.message)).toEqual([
      'is not a question of this activity',
      'is missing',
    ]);
  });

  it('the_result_carries_the_response_the_correct_answer_and_the_explanation', () => {
    const questions = [...validQuestions().slice(0, 4), orderingQuestion()];
    const checks = checkAll(questions);
    const answers = [mc(0, 0), fill(1, 'would have heard'), mc(2, 1), fill(3, 'Had')];
    const graded = grade(checks, answers);
    const view = resultView(checks, answers, graded, { timeSpentSeconds: 402, submittedAt: new Date('2026-10-02T07:44:44.000Z') });

    expect(view).toMatchObject({ scoreCorrect: 2, scoreTotal: 4, unscoredCount: 1, timeSpentSeconds: 402, submittedAt: '2026-10-02T07:44:44.000Z' });
    expect(view.questions[0]).toMatchObject({
      outcome: 'incorrect',
      response: 'Rising interest rates',
      correctAnswer: "The council's refusal to consult tenants",
      acceptedAnswers: [],
      explanation: expect.stringContaining('second paragraph'),
    });
    expect(view.questions[1]).toMatchObject({
      outcome: 'incorrect',
      response: 'would have heard',
      correctAnswer: 'had listened to',
      acceptedAnswers: ['had listened to', 'had heard'],
      explanation: expect.stringContaining('third conditional'),
    });
    expect(view.questions[4]).toMatchObject({ format: 'unscored', outcome: 'unscored', response: null, correctAnswer: null, explanation: null, unscoredReason: 'format_unavailable' });
  });

  it('a_corrupted_key_is_unscored_and_flagged', () => {
    const checks = checkAll([mcQuestion(), fillQuestion(), mcQuestion({ answer: 'nope' }), ...validQuestions().slice(3)]);
    const graded = grade(checks, [mc(0, 1), fill(1, 'had heard'), fill(3, 'Had'), mc(4, 1)]);
    expect(graded).toMatchObject({ scoreTotal: 4, unscoredCount: 1 });
    expect(graded.results[2]).toMatchObject({ outcome: 'unscored', unscoredReason: 'answer_key_invalid' });
    expect(graded.results[2]?.issues.length).toBeGreaterThan(0);
  });
});
