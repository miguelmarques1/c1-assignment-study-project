import type { ObjectiveAnswer, ObjectiveQuestionView } from '@english-quest/shared';

import { cn } from '@/components/ui';

export interface QuestionDotsProps {
  questions: readonly ObjectiveQuestionView[];
  answers: readonly ObjectiveAnswer[];
  /** The question the learner is on (the frontier). */
  current: number;
  /** The earlier question being reviewed read-only, if any. */
  viewing: number | null;
  onSelect: (position: number) => void;
}

/**
 * One dot per question. Answered (or unscored) ones before the current can be
 * revisited read-only; later ones stay disabled, so navigation is
 * forward-only (A7).
 */
export function QuestionDots({ questions, answers, current, viewing, onSelect }: QuestionDotsProps) {
  const answered = new Set(answers.map((answer) => answer.index));
  return (
    <nav aria-label="Questions" className="flex flex-wrap items-center gap-sm">
      {questions.map((question, position) => {
        const done = position < current && (answered.has(question.index) || question.format === 'unscored');
        const active = (viewing ?? current) === position;
        const state = question.format === 'unscored' ? 'not scored' : done ? 'answered' : position === current ? 'current' : 'not answered yet';
        return (
          <button
            key={question.index}
            type="button"
            disabled={position > current}
            aria-current={active ? 'step' : undefined}
            aria-label={`Question ${position + 1}, ${state}`}
            onClick={() => onSelect(position)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full border-2 border-outline-strong text-label-md outline-offset-2 outline-outline-strong focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60',
              active ? 'bg-secondary text-on-secondary' : done ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface',
            )}
          >
            {position + 1}
          </button>
        );
      })}
    </nav>
  );
}
