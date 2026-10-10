import { answerKeyIssues, questionSchema, type Question, type UnscoredReason } from '@english-quest/shared';

import { CORE_QUESTION_FORMATS } from '../activity.constants';

export type ScorableQuestion = Extract<Question, { format: 'multiple_choice' | 'fill_blank' }>;

export type QuestionCheck =
  | { index: number; scorable: true; question: ScorableQuestion }
  | { index: number; scorable: false; reason: UnscoredReason; prompt: string | null; issues: string[] };

function promptOf(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && 'prompt' in raw && typeof raw.prompt === 'string' && raw.prompt.trim() !== '') {
    return raw.prompt;
  }
  return null;
}

function isCoreFormat(question: Question): question is ScorableQuestion {
  return (CORE_QUESTION_FORMATS as readonly string[]).includes(question.format);
}

/**
 * Classifies one stored question (A2, A15): scorable, unsupported in Core, or
 * carrying a key F13's own validators reject. A snapshot is data a curator
 * wrote, so nothing here trusts its shape.
 */
export function checkQuestion(raw: unknown, index: number): QuestionCheck {
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      index,
      scorable: false,
      reason: 'answer_key_invalid',
      prompt: promptOf(raw),
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'question'}: ${issue.message}`),
    };
  }
  const question = parsed.data;
  if (!isCoreFormat(question)) {
    return { index, scorable: false, reason: 'format_unavailable', prompt: question.prompt, issues: [] };
  }
  const keyIssues = answerKeyIssues(question, index);
  if (keyIssues.length > 0) {
    return {
      index,
      scorable: false,
      reason: 'answer_key_invalid',
      prompt: question.prompt,
      issues: keyIssues.map((issue) => issue.message),
    };
  }
  return { index, scorable: true, question };
}

export function checkAll(questions: unknown): QuestionCheck[] {
  const list = Array.isArray(questions) ? questions : [];
  return list.map((raw, index) => checkQuestion(raw, index));
}

/** An item with no scorable question cannot be run (A15). */
export function isRunnable(checks: readonly QuestionCheck[]): boolean {
  return checks.some((check) => check.scorable);
}
