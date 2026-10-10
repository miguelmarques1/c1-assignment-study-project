'use client';

import type { ObjectiveResultQuestion } from '@english-quest/shared';
import { useId, useState } from 'react';

import { CheckCircleIcon, CrossCircleIcon } from '@/components/ui';
import { UNSCORED_MESSAGES } from './unscored-question';

const OUTCOME_LABEL = { correct: 'Correct', incorrect: 'Incorrect', unscored: 'Not scored' } as const;

/**
 * One question's feedback: correct or incorrect (always with a text label,
 * never colour alone), the learner's answer, the correct answer where they
 * differ, and the stored explanation. Incorrect questions open expanded and
 * correct ones collapsed.
 */
export function ResultQuestion({ question, number }: { question: ObjectiveResultQuestion; number: number }) {
  const [expanded, setExpanded] = useState(question.outcome !== 'correct');
  const bodyId = useId();
  const differs = question.response !== question.correctAnswer;
  const others = question.acceptedAnswers.filter((answer) => answer !== question.correctAnswer);

  return (
    <li className="rounded-lg border-2 border-outline-strong bg-surface-container-lowest">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-md p-md text-left outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        <span className="inline-flex shrink-0 items-center gap-xs">
          {question.outcome === 'correct' ? <CheckCircleIcon /> : question.outcome === 'incorrect' ? <CrossCircleIcon /> : null}
          <span className="text-label-lg text-on-surface">
            Question {number}: {OUTCOME_LABEL[question.outcome]}
          </span>
        </span>
        <span className="flex-1 truncate text-body-md text-on-surface-variant">{question.prompt}</span>
      </button>
      {expanded ? (
        <div id={bodyId} className="flex flex-col gap-sm border-t-2 border-outline-strong p-md text-body-md text-on-surface">
          {question.prompt ? <p>{question.prompt}</p> : null}
          {question.outcome === 'unscored' ? (
            <p className="text-on-surface-variant">{question.unscoredReason ? UNSCORED_MESSAGES[question.unscoredReason] : null}</p>
          ) : (
            <>
              <p>
                <span className="text-label-lg text-on-surface-variant">Your answer: </span>
                {question.response}
              </p>
              {differs ? (
                <p>
                  <span className="text-label-lg text-on-surface-variant">Correct answer: </span>
                  {question.correctAnswer}
                </p>
              ) : null}
              {others.length > 0 ? (
                <p className="text-on-surface-variant">Also accepted: {others.join(', ')}</p>
              ) : null}
              {question.explanation ? <p className="text-on-surface-variant">{question.explanation}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
