import type { ObjectiveAnswer, ObjectiveResult } from '@english-quest/shared';

import type { GradeOutcome } from './grading';
import type { QuestionCheck } from './question-check';

export interface ResultMeta {
  timeSpentSeconds: number | null;
  submittedAt: Date;
}

/** The post-submission view: the response, the correct answer and the explanation per question (A3). */
export function resultView(
  checks: readonly QuestionCheck[],
  answers: readonly ObjectiveAnswer[],
  graded: GradeOutcome,
  meta: ResultMeta,
): ObjectiveResult {
  const byIndex = new Map(answers.map((answer) => [answer.index, answer]));
  return {
    scoreCorrect: graded.scoreCorrect,
    scoreTotal: graded.scoreTotal,
    unscoredCount: graded.unscoredCount,
    timeSpentSeconds: meta.timeSpentSeconds,
    submittedAt: meta.submittedAt.toISOString(),
    questions: checks.map((check, position) => {
      const outcome = graded.results[position]?.outcome === 'correct' ? ('correct' as const) : ('incorrect' as const);
      if (!check.scorable) {
        return {
          index: check.index,
          format: 'unscored' as const,
          prompt: check.prompt,
          outcome: 'unscored' as const,
          response: null,
          correctAnswer: null,
          acceptedAnswers: [],
          explanation: null,
          unscoredReason: check.reason,
        };
      }
      const { question } = check;
      const answer = byIndex.get(check.index);
      if (question.format === 'multiple_choice') {
        return {
          index: check.index,
          format: 'multiple_choice' as const,
          prompt: question.prompt,
          outcome,
          response: answer?.format === 'multiple_choice' ? (question.options[answer.optionIndex] ?? null) : null,
          correctAnswer: question.answer,
          acceptedAnswers: [],
          explanation: question.explanation,
          unscoredReason: null,
        };
      }
      return {
        index: check.index,
        format: 'fill_blank' as const,
        prompt: question.prompt,
        outcome,
        response: answer?.format === 'fill_blank' ? answer.text : null,
        correctAnswer: question.answer[0] ?? null,
        acceptedAnswers: [...question.answer],
        explanation: question.explanation,
        unscoredReason: null,
      };
    }),
  };
}
