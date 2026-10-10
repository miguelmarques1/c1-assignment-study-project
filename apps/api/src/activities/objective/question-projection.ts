import { createHash } from 'node:crypto';

import type { ObjectiveQuestionView } from '@english-quest/shared';

import { BLANK_LENGTH_RANGE } from '../activity.constants';
import type { QuestionCheck } from './question-check';

const BLANK_MARKER = /_{3,}/;

/** The text on each side of the single blank marker. */
export function splitBlank(prompt: string): { before: string; after: string } {
  const match = BLANK_MARKER.exec(prompt);
  if (!match) {
    return { before: prompt, after: '' };
  }
  return { before: prompt.slice(0, match.index), after: prompt.slice(match.index + match[0].length) };
}

/** The input is as wide as the longest accepted answer, so its size hints at the answer without giving it away (A24). */
export function blankLength(acceptedAnswers: readonly string[]): number {
  const longest = acceptedAnswers.reduce((max, answer) => Math.max(max, answer.length), 0);
  return Math.min(Math.max(longest, BLANK_LENGTH_RANGE.min), BLANK_LENGTH_RANGE.max);
}

/**
 * What a client may see of a question before submitting (A3). Built field by
 * field rather than by deleting `answer` and `explanation`, so a field added
 * to the stored shape later cannot leak by default.
 */
export function projectQuestion(check: QuestionCheck): ObjectiveQuestionView {
  if (!check.scorable) {
    return { index: check.index, format: 'unscored', prompt: check.prompt, reason: check.reason };
  }
  const { question } = check;
  if (question.format === 'multiple_choice') {
    return { index: check.index, format: 'multiple_choice', prompt: question.prompt, options: [...question.options] };
  }
  return {
    index: check.index,
    format: 'fill_blank',
    prompt: question.prompt,
    ...splitBlank(question.prompt),
    blankLength: blankLength(question.answer),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

/** SHA-256 hex of the questions' canonical JSON (sorted keys), so key order never changes it. */
export function questionsFingerprint(questions: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(questions))).digest('hex');
}
