import type { ObjectiveAnswer, UnscoredReason } from '@english-quest/shared';

import { matchesAccepted } from './answer-normalization';
import type { QuestionCheck } from './question-check';

export interface AnswerIssue {
  path: string;
  message: string;
}

export interface GradedQuestion {
  index: number;
  outcome: 'correct' | 'incorrect' | 'unscored';
  unscoredReason: UnscoredReason | null;
  /** The key problems found, for the curator's log. Never an answer. */
  issues: string[];
}

export interface GradeOutcome {
  results: GradedQuestion[];
  scoreCorrect: number;
  /** Scored questions only. */
  scoreTotal: number;
  unscoredCount: number;
}

/**
 * Why a submitted answer set cannot be graded: it must cover every scorable
 * question exactly once, answer no unscored one, match each question's
 * format and stay in range. Empty when it can.
 */
export function answerIssues(checks: readonly QuestionCheck[], answers: readonly ObjectiveAnswer[]): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const seen = new Set<number>();
  for (const answer of answers) {
    const path = `answers.${answer.index}`;
    if (seen.has(answer.index)) {
      issues.push({ path, message: 'is answered more than once' });
      continue;
    }
    seen.add(answer.index);
    const check = checks[answer.index];
    if (!check) {
      issues.push({ path, message: 'is not a question of this activity' });
    } else if (!check.scorable) {
      issues.push({ path, message: 'answers a question that is not scored' });
    } else if (check.question.format !== answer.format) {
      issues.push({ path, message: `must be a ${check.question.format} answer` });
    } else if (answer.format === 'multiple_choice' && answer.optionIndex >= 4) {
      issues.push({ path, message: 'optionIndex is out of range' });
    }
  }
  for (const check of checks) {
    if (check.scorable && !seen.has(check.index)) {
      issues.push({ path: `answers.${check.index}`, message: 'is missing' });
    }
  }
  return issues;
}

function isCorrect(check: QuestionCheck & { scorable: true }, answer: ObjectiveAnswer): boolean {
  const { question } = check;
  if (question.format === 'multiple_choice' && answer.format === 'multiple_choice') {
    return question.options[answer.optionIndex] === question.answer;
  }
  if (question.format === 'fill_blank' && answer.format === 'fill_blank') {
    return matchesAccepted(answer.text, question.answer);
  }
  return false;
}

/** Assumes `answerIssues` came back empty. The score is over the scorable questions only. */
export function grade(checks: readonly QuestionCheck[], answers: readonly ObjectiveAnswer[]): GradeOutcome {
  const byIndex = new Map(answers.map((answer) => [answer.index, answer]));
  const results: GradedQuestion[] = checks.map((check) => {
    if (!check.scorable) {
      return { index: check.index, outcome: 'unscored', unscoredReason: check.reason, issues: check.issues };
    }
    const answer = byIndex.get(check.index);
    return {
      index: check.index,
      outcome: answer && isCorrect(check, answer) ? 'correct' : 'incorrect',
      unscoredReason: null,
      issues: [],
    };
  });
  const scored = results.filter((result) => result.outcome !== 'unscored');
  return {
    results,
    scoreCorrect: scored.filter((result) => result.outcome === 'correct').length,
    scoreTotal: scored.length,
    unscoredCount: results.length - scored.length,
  };
}
