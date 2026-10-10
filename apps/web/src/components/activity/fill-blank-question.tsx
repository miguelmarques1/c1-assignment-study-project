import type { ObjectiveAnswer, ObjectiveQuestionView } from '@english-quest/shared';

type FillBlank = Extract<ObjectiveQuestionView, { format: 'fill_blank' }>;

export interface FillBlankQuestionProps {
  question: FillBlank;
  /** 1-based, for the input's accessible name. */
  number: number;
  value: string;
  locked: boolean;
  onChange: (answer: ObjectiveAnswer) => void;
  onSubmit?: () => void;
}

/**
 * The sentence with an inline input where the blank is, sized to the
 * expected answer. Autocomplete, autocorrect and spellcheck are off: a
 * phone keyboard that "fixes" the learner's grammar would defeat the
 * exercise.
 */
export function FillBlankQuestion({ question, number, value, locked, onChange, onSubmit }: FillBlankQuestionProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-xs text-body-lg text-on-surface">
      <span>{question.before}</span>
      <input
        type="text"
        size={question.blankLength}
        value={value}
        disabled={locked}
        maxLength={100}
        aria-label={`Answer for question ${number}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => onChange({ index: question.index, format: 'fill_blank', text: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        className="max-w-full rounded-md border-2 border-outline-strong bg-surface-container-lowest px-sm py-xs text-body-lg text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2 disabled:opacity-80"
      />
      <span>{question.after}</span>
    </p>
  );
}
