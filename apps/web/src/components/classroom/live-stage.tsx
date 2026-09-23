import { ConnectionQuality } from 'livekit-client';

import { SignalIcon, VolumeIcon, VolumeOffIcon } from '@/components/ui';
import { ElapsedTimer } from './classroom-header';
import { UnstableConnectionBanner } from './connection-quality';
import { ParticipantGrid } from './participant-grid';
import { ScenarioPanel } from './scenario-panel';
import type { ParticipantView } from './use-classroom-room';
import type { UseScenarioResult } from './use-scenario';

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: 'Excellent',
  [ConnectionQuality.Good]: 'Good',
  [ConnectionQuality.Poor]: 'Poor',
  [ConnectionQuality.Lost]: 'Lost',
  [ConnectionQuality.Unknown]: 'Checking…',
};

export interface LiveStageProps {
  participants: ParticipantView[];
  startedAt: string | null;
  scenario: UseScenarioResult;
  briefOpen: boolean;
  onCloseBrief: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
}

/**
 * The live lesson: a top bar with the elapsed time, the situation's title and
 * the caller's own connection, the video stage, and — when toggled open from
 * the control bar — the scenario brief beside it. Opening or closing the
 * brief only reflows the columns; the video elements stay mounted, so audio
 * and video are never interrupted.
 */
export function LiveStage({
  participants,
  startedAt,
  scenario,
  briefOpen,
  onCloseBrief,
  soundOn,
  onToggleSound,
}: LiveStageProps) {
  const local = participants.find((participant) => participant.isLocal);
  const unstable = participants.some(
    (participant) =>
      !participant.isLocal &&
      (participant.quality === ConnectionQuality.Poor || participant.quality === ConnectionQuality.Lost),
  );
  const title = scenario.view?.situation?.title ?? 'Live lesson';

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col justify-between gap-sm border-b-2 border-outline-strong pb-md sm:flex-row sm:items-center">
        <div className="flex items-center gap-md">
          <ElapsedTimer startedAt={startedAt} live />
          <div>
            <h1 className="text-headline-sm text-on-surface">{title}</h1>
            {local ? (
              <p className="flex items-center gap-xs text-body-sm text-on-surface-variant">
                <SignalIcon size={14} level={local.quality === ConnectionQuality.Poor ? 1 : 3} />
                Connection: <strong className="text-tertiary">{QUALITY_LABEL[local.quality]}</strong>
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-sm">
          {/* F07's recording indicator mounts here once egress lands. */}
          <div data-slot="recording-indicator" />
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={!soundOn}
            className="press-button inline-flex items-center gap-xs rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-xs text-label-md text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
          >
            {soundOn ? <VolumeIcon size={18} /> : <VolumeOffIcon size={18} />}
            Sound: {soundOn ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {unstable ? <UnstableConnectionBanner /> : null}

      <div className="grid grid-cols-1 items-start gap-lg lg:grid-cols-12">
        <div className={briefOpen ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <ParticipantGrid participants={participants} />
        </div>
        {briefOpen ? (
          <div className="lg:col-span-4">
            <ScenarioPanel scenario={scenario} onClose={onCloseBrief} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
