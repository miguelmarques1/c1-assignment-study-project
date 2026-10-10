import type { ObjectiveQuestionView } from '@english-quest/shared';

type Unscored = Extract<ObjectiveQuestionView, { format: 'unscored' }>;

export const UNSCORED_MESSAGES = {
  format_unavailable: "This question type isn't available yet.",
  answer_key_invalid: 'This question could not be corrected.',
} as const;

/** A question the runner cannot score: its prompt (when it has one) and why, with nothing to answer (A2, A15). */
export function UnscoredQuestion({ question }: { question: Unscored }) {
  return (
    <div className="flex flex-col gap-sm">
      {question.prompt ? <p className="text-body-lg text-on-surface">{question.prompt}</p> : null}
      <p role="note" className="rounded-md border-2 border-outline-strong bg-badge-warning-bg p-md text-body-md text-badge-warning-fg">
        {UNSCORED_MESSAGES[question.reason]}
      </p>
    </div>
  );
}
