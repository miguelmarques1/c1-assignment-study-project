'use client';

import type { ActivityView } from '@english-quest/shared';

import { Skeleton } from '@/components/ui';
import { ActivityShell } from './activity-shell';
import { ActivityUnavailable } from './activity-unavailable';
import { ListeningPane } from './listening-pane';
import { PassagePane } from './passage-pane';
import { QuestionCard } from './question-card';
import { QuestionDots } from './question-dots';
import { ResultsView } from './results-view';
import { SubmissionStatus } from './submission-status';
import { useObjectiveRunner } from './use-objective-runner';

/**
 * The full-screen runner for the five bank-backed kinds: the passage or the
 * audio beside (wide) or above (narrow) one question at a time, the
 * submission states, and the results (spec §2 "Runner flow"). All the
 * state lives in `useObjectiveRunner`; this lays it out.
 */
export function ObjectiveRunner({ initialView }: { initialView: ActivityView }) {
  const runner = useObjectiveRunner(initialView);
  const { view, phase } = runner;
  const objective = view.objective;

  if (!objective) {
    return null;
  }

  if (!runner.ready) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-md">
        <span className="sr-only">Loading your activity</span>
        <Skeleton className="h-lg w-full" />
        <Skeleton className="h-xl w-full rounded-md" />
      </div>
    );
  }

  if (phase === 'unavailable' && runner.unavailable) {
    return (
      <ActivityShell view={view}>
        <ActivityUnavailable reason={runner.unavailable} activity={view.activity} />
      </ActivityShell>
    );
  }

  if (phase === 'results') {
    return (
      <ActivityShell view={view}>
        <ResultsView view={view} next={runner.next} />
      </ActivityShell>
    );
  }

  const shownIndex = runner.viewing ?? runner.index;
  const question = runner.questions[shownIndex];
  const answering = phase === 'answering';
  const reviewing = runner.viewing !== null;
  const locked = reviewing || !answering || (question ? runner.lockedAnswer(question) !== null : false);
  const answer = question ? (locked ? runner.lockedAnswer(question) : runner.pending?.index === question.index ? runner.pending : null) : null;
  const listening = objective.item.type === 'listening';
  const passage = objective.item.passage;

  return (
    <ActivityShell view={view}>
      {runner.notice ? (
        <p role="status" className="rounded-md border-2 border-outline-strong bg-badge-info-bg p-md text-body-md text-badge-info-fg">
          {runner.notice}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-lg lg:grid-cols-2 lg:items-start">
        {listening ? (
          <div className="lg:sticky lg:top-md">
            <ListeningPane activityId={view.activity.id} onFirstPlay={runner.onFirstPlay} onError={runner.onAudioError} onRetry={runner.onAudioRetry} />
          </div>
        ) : passage ? (
          <div className="lg:sticky lg:top-md">
            <PassagePane passage={passage} />
          </div>
        ) : null}
        {runner.audioFailed ? null : (
          <div className="flex min-w-0 flex-col gap-md lg:col-start-2">
            <QuestionDots
              questions={runner.questions}
              answers={runner.answers}
              current={runner.index}
              viewing={runner.viewing}
              onSelect={(position) => runner.setViewing(position === runner.index ? null : position)}
            />
            {question ? (
              <QuestionCard
                question={question}
                position={shownIndex}
                total={runner.questions.length}
                answer={answer}
                locked={locked}
                onSelect={runner.select}
                action={
                  answering && !reviewing
                    ? { label: runner.isLast ? 'Submit answers' : 'Next question', enabled: runner.canConfirm, onClick: runner.confirm }
                    : undefined
                }
                onBackToCurrent={reviewing ? () => runner.setViewing(null) : undefined}
              />
            ) : null}
            <SubmissionStatus phase={phase} onRetry={runner.retryNow} />
          </div>
        )}
      </div>
    </ActivityShell>
  );
}
