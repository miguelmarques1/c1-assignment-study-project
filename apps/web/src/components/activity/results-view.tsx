import type { ActivityView } from '@english-quest/shared';
import Link from 'next/link';

import type { NextStep } from '@/lib/activity-navigation';
import { PassagePane } from './passage-pane';
import { RatingPrompt } from './rating-prompt';
import { ResultQuestion } from './result-question';

export interface ResultsViewProps {
  view: ActivityView;
  next: NextStep;
}

const PLAN_REPLACED_NOTE = 'This activity is no longer in your current plan. Your answers still count toward your profile.';

/** The score, every question's feedback, the transcript for listening, the rating prompt and the way on. */
export function ResultsView({ view, next }: ResultsViewProps) {
  const objective = view.objective;
  const result = objective?.result;
  if (!objective || !result) {
    return null;
  }
  const { activity } = view;
  const transcript = objective.item.passage?.kind === 'transcript' ? objective.item.passage : null;

  return (
    <div className="flex flex-col gap-lg">
      <section aria-labelledby="score-heading" className="flex flex-col gap-xs rounded-lg border-2 border-outline-strong bg-primary-container p-lg text-on-primary-container shadow-card">
        <h2 id="score-heading" className="text-headline-md">
          {result.scoreCorrect} of {result.scoreTotal} correct
        </h2>
        {result.unscoredCount > 0 ? (
          <p className="text-body-md">
            {result.unscoredCount === 1 ? "1 question wasn't scored." : `${result.unscoredCount} questions weren't scored.`}
          </p>
        ) : null}
      </section>

      {activity.readOnly && activity.state !== 'completed' ? (
        <p role="note" className="rounded-md border-2 border-outline-strong bg-badge-info-bg p-md text-body-md text-badge-info-fg">
          {PLAN_REPLACED_NOTE}
        </p>
      ) : null}

      <ol className="flex flex-col gap-md" aria-label="Question feedback">
        {result.questions.map((question, position) => (
          <ResultQuestion key={question.index} question={question} number={position + 1} />
        ))}
      </ol>

      {transcript ? <PassagePane passage={transcript} source={objective.item.source} /> : null}

      {activity.state === 'completed' ? (
        <RatingPrompt activityId={activity.id} initial={{ rating: activity.rating, notUseful: activity.notUseful }} />
      ) : null}

      <div className="flex justify-end">
        <Link
          href={next.href}
          className="press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-primary px-lg py-sm text-title-md font-semibold text-on-primary outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          {next.kind === 'next' ? 'Next activity' : 'Back to Today'}
        </Link>
      </div>
    </div>
  );
}
