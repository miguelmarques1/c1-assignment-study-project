import {
  pipelineStageLabels,
  type OtherParticipantProcessing,
  type ParticipantStageState,
} from '@english-quest/shared';

import { formatElapsed } from '../format';
import { Stepper, type StepTone } from './stepper';

const STATE: Record<ParticipantStageState, { label: string; tone: StepTone }> = {
  completed: { label: 'Done', tone: 'done' },
  pending: { label: 'In progress', tone: 'waiting' },
  not_started: { label: 'Not started', tone: 'idle' },
  unavailable: { label: 'Unavailable', tone: 'idle' },
};

/**
 * Another participant's processing, coarse by construction: the response
 * carries no reason, provider message, progress or retry for them, and this
 * view has nowhere to put one (F19, A10).
 */
export function OtherStepper({ other }: { other: OtherParticipantProcessing }) {
  return (
    <section aria-labelledby={`other-${other.userId}`} className="flex flex-col gap-sm">
      <h3 id={`other-${other.userId}`} className="text-title-md text-on-surface">
        {other.displayName}
      </h3>
      <Stepper
        label={`${other.displayName}'s processing`}
        steps={other.stages.map((stage) => ({
          key: stage.stage,
          title: pipelineStageLabels[stage.stage].title,
          state: STATE[stage.state].label,
          tone: STATE[stage.state].tone,
          detail:
            stage.state === 'completed' && stage.startedAt && stage.finishedAt ? (
              <p className="text-body-sm text-on-surface-variant">
                Took {formatElapsed(Date.parse(stage.finishedAt) - Date.parse(stage.startedAt))}
              </p>
            ) : null,
        }))}
      />
    </section>
  );
}
