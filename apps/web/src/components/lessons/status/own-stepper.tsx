import {
  pipelineStageLabels,
  pipelineStageSchema,
  type LessonPipelineView,
  type LessonRecordingView,
  type LessonScenarioStep,
  type PipelineStage,
  type PipelineStageView,
} from '@english-quest/shared';
import Link from 'next/link';

import { formatDuration, formatElapsed } from '../format';
import { LocalizedTime } from '../localized-time';
import { RetryAction } from './retry-action';
import { Stepper, type StepperStep } from './stepper';

const DETAIL = 'text-body-sm text-on-surface-variant';

function scenarioStep(scenario: LessonScenarioStep): StepperStep {
  const ready = scenario.status === 'ready';
  const card =
    scenario.myCardStatus === 'ready'
      ? 'Your role card was ready.'
      : scenario.myCardStatus === 'failed'
        ? 'Your role card could not be generated.'
        : null;
  return {
    key: 'scenario',
    title: 'Scenario',
    state: ready ? 'Ready' : scenario.status === 'failed' ? 'Failed' : 'No scenario',
    tone: ready ? 'done' : 'idle',
    detail: (
      <>
        {!ready ? <p className={DETAIL}>This lesson ran without a generated situation.</p> : null}
        {card ? <p className={DETAIL}>{card}</p> : null}
      </>
    ),
  };
}

function durationOf(view: PipelineStageView): string | null {
  return view.startedAt && view.finishedAt
    ? formatElapsed(Date.parse(view.finishedAt) - Date.parse(view.startedAt))
    : null;
}

function stageStep(
  stage: PipelineStage,
  view: PipelineStageView | undefined,
  context: { lessonId: string; serverTime: string; recording: LessonRecordingView | null },
): StepperStep {
  const labels = pipelineStageLabels[stage];
  if (!view) {
    return { key: stage, title: labels.title, state: 'Not started', tone: 'idle' };
  }

  const partial =
    stage === 'recording' && context.recording?.mine.recordingStatus === 'partial' && context.recording.mine.capturedSeconds
      ? `Captured ${formatDuration(context.recording.mine.capturedSeconds)} of audio`
      : null;
  const progress = view.progress ? `${view.progress.done} of ${view.progress.total} excerpts` : null;

  switch (view.status) {
    case 'completed': {
      const duration = durationOf(view);
      return {
        key: stage,
        title: labels.title,
        state: 'Done',
        tone: 'done',
        detail: (
          <>
            {duration ? <p className={DETAIL}>Took {duration}</p> : null}
            {progress ? <p className={DETAIL}>{progress}</p> : null}
            {partial ? <p className={DETAIL}>{partial}</p> : null}
          </>
        ),
      };
    }
    case 'running':
      return {
        key: stage,
        title: labels.active,
        state: 'Running',
        tone: 'active',
        detail: (
          <>
            {view.startedAt ? (
              <p className={DETAIL}>
                {formatElapsed(Date.parse(context.serverTime) - Date.parse(view.startedAt))} so far
              </p>
            ) : null}
            {progress ? <p className={DETAIL}>{progress}</p> : null}
          </>
        ),
      };
    case 'retrying':
      return {
        key: stage,
        title: labels.active,
        state: 'Retrying',
        tone: 'active',
        detail: view.nextAttemptAt ? (
          <p className={DETAIL}>
            Next attempt at <LocalizedTime iso={view.nextAttemptAt} format="time" />
          </p>
        ) : null,
      };
    case 'queued':
      return { key: stage, title: labels.title, state: 'Queued', tone: 'waiting' };
    case 'blocked_missing_key':
      return {
        key: stage,
        title: labels.title,
        state: 'Blocked',
        tone: 'attention',
        detail: (
          <>
            {view.reason ? <p className="text-body-md text-on-surface">{view.reason}</p> : null}
            <Link href="/settings" className="text-label-lg text-primary underline-offset-4 hover:underline">
              Open settings
            </Link>
          </>
        ),
      };
    case 'failed': {
      const recordingRetry = stage === 'recording' && context.recording?.mine.branch?.retryable === true;
      return {
        key: stage,
        title: labels.title,
        state: 'Failed',
        tone: 'attention',
        detail: (
          <>
            {view.reason ? <p className="text-body-md text-on-surface">{view.reason}</p> : null}
            {view.providerMessage ? <p className={DETAIL}>Details: {view.providerMessage}</p> : null}
            {partial ? <p className={DETAIL}>{partial}</p> : null}
            {view.retryable || recordingRetry ? (
              <RetryAction
                lessonId={context.lessonId}
                route={recordingRetry ? 'recording' : 'pipeline'}
                lastAttemptAt={view.lastAttemptAt}
              />
            ) : view.lastAttemptAt ? (
              <p className={DETAIL}>
                Last attempt <LocalizedTime iso={view.lastAttemptAt} format="time" />
              </p>
            ) : null}
          </>
        ),
      };
    }
  }
}

/**
 * The caller's own processing: the scenario step, then every stage of the
 * shared order with its state, timing, progress, reason, settings link and
 * retry. A stage this branch never reached reads `Not started`.
 */
export function OwnStepper({
  lessonId,
  scenario,
  pipeline,
  recording,
  statusReason,
}: {
  lessonId: string;
  scenario: LessonScenarioStep;
  pipeline: LessonPipelineView;
  recording: LessonRecordingView | null;
  statusReason: string | null;
}) {
  const stages = pipeline.branch?.stages ?? [];
  const steps = [
    scenarioStep(scenario),
    ...pipelineStageSchema.options.map((stage) =>
      stageStep(
        stage,
        stages.find((view) => view.stage === stage),
        { lessonId, serverTime: pipeline.serverTime, recording },
      ),
    ),
  ];

  return (
    <div className="flex flex-col gap-sm">
      {!pipeline.branch && statusReason ? <p className="text-body-md text-on-surface">{statusReason}</p> : null}
      <Stepper label="Your processing" steps={steps} />
    </div>
  );
}
