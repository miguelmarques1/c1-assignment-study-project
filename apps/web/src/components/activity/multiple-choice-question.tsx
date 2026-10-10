import type { ObjectiveAnswer, ObjectiveQuestionView } from '@english-quest/shared';
import { useId } from 'react';

import { cn } from '@/components/ui';

type MultipleChoice = Extract<ObjectiveQuestionView, { format: 'multiple_choice' }>;

export interface MultipleChoiceQuestionProps {
  question: MultipleChoice;
  /** The chosen option, or null before one is picked. */
  value: number | null;
  /** A locked answer is shown read-only. */
  locked: boolean;
  onSelect: (answer: ObjectiveAnswer) => void;
}

/**
 * Four large option cards around visually hidden native radios, so the
 * group keeps arrow-key navigation and a real `radiogroup` for assistive
 * technology while every option is a big touch target.
 */
export function MultipleChoiceQuestion({ question, value, locked, onSelect }: MultipleChoiceQuestionProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={question.prompt} className="flex flex-col gap-md">
      {question.options.map((option, optionIndex) => (
        <label
          key={option}
          className={cn(
            'flex min-h-14 cursor-pointer items-center gap-md rounded-lg border-2 border-outline-strong p-md text-body-lg',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-outline-strong',
            value === optionIndex ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-lowest text-on-surface',
            locked && 'cursor-default opacity-80',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === optionIndex}
            disabled={locked}
            onChange={() => onSelect({ index: question.index, format: 'multiple_choice', optionIndex })}
          />
          <span
            aria-hidden="true"
            className={cn(
              'flex h-md w-md shrink-0 items-center justify-center rounded-full border-2 border-outline-strong',
              value === optionIndex ? 'bg-primary' : 'bg-surface',
            )}
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
