import type { ObjectiveAnswer, ObjectiveQuestionView } from '@english-quest/shared';

import { Button } from '@/components/ui';
import { FillBlankQuestion } from './fill-blank-question';
import { MultipleChoiceQuestion } from './multiple-choice-question';
import { UnscoredQuestion } from './unscored-question';

export interface QuestionCardProps {
  question: ObjectiveQuestionView;
  /** Position among the item's questions, 0-based, and their count. */
  position: number;
  total: number;
  /** The answer shown: the locked one, or the pending choice. */
  answer: ObjectiveAnswer | null;
  locked: boolean;
  onSelect: (answer: ObjectiveAnswer) => void;
  /** `Next question` or `Submit answers`; absent while reviewing an earlier question. */
  action?: { label: string; enabled: boolean; onClick: () => void };
  /** Back to the current question, while reviewing an earlier one. */
  onBackToCurrent?: () => void;
}

/** One question at a time, headed `Question 2 of 5`. */
export function QuestionCard({ question, position, total, answer, locked, onSelect, action, onBackToCurrent }: QuestionCardProps) {
  const number = position + 1;
  return (
    <section aria-labelledby="question-heading" className="flex flex-col gap-lg rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card">
      <h2 id="question-heading" className="text-label-lg text-on-surface-variant">
        Question {number} of {total}
      </h2>
      {question.format === 'multiple_choice' ? (
        <div className="flex flex-col gap-md">
          <p className="text-title-md text-on-surface">{question.prompt}</p>
          <MultipleChoiceQuestion question={question} value={answer?.format === 'multiple_choice' ? answer.optionIndex : null} locked={locked} onSelect={onSelect} />
        </div>
      ) : question.format === 'fill_blank' ? (
        <FillBlankQuestion
          question={question}
          number={number}
          value={answer?.format === 'fill_blank' ? answer.text : ''}
          locked={locked}
          onChange={onSelect}
          onSubmit={action?.enabled ? action.onClick : undefined}
        />
      ) : (
        <UnscoredQuestion question={question} />
      )}
      {action ? (
        <Button type="button" size="lg" disabled={!action.enabled} onClick={action.onClick} fullWidth>
          {action.label}
        </Button>
      ) : null}
      {onBackToCurrent ? (
        <Button type="button" variant="neutral" onClick={onBackToCurrent}>
          Back to the current question
        </Button>
      ) : null}
    </section>
  );
}
