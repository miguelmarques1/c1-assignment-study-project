import type { ClassroomAwaiting } from '@english-quest/shared';
import { ConnectionQuality } from 'livekit-client';

import { CameraIcon, Meter, RefreshIcon, SignalIcon, UsersIcon, VerifiedIcon } from '@/components/ui';
import { ElapsedTimer } from './classroom-header';
import { ParticipantTile } from './participant-tile';
import { ScenarioRegion } from './scenario-region';
import { useAudioLevel } from './use-audio-level';
import type { ParticipantView } from './use-classroom-room';
import type { UseScenarioResult } from './use-scenario';

export interface WaitingPanelProps {
  awaiting: ClassroomAwaiting[];
  /** The caller's own participant view, for the live local preview and level meter. */
  local: ParticipantView | null;
  scenario: UseScenarioResult;
  maxParticipants: number | null;
}

/** Lists every other account with a seat available that is not yet connected, capped at the remaining seats. */
function namesList(awaiting: ClassroomAwaiting[]): string {
  const names = awaiting.map((entry) => entry.displayName);
  if (names.length === 0) {
    return 'others';
  }
  if (names.length === 1) {
    return names[0]!;
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  [ConnectionQuality.Excellent]: 'Excellent',
  [ConnectionQuality.Good]: 'Stable',
  [ConnectionQuality.Poor]: 'Unstable',
  [ConnectionQuality.Lost]: 'Lost',
  [ConnectionQuality.Unknown]: 'Checking…',
};

function SessionBar({ awaiting, local, maxParticipants }: Omit<WaitingPanelProps, 'scenario'>) {
  return (
    <div className="flex flex-col items-start justify-between gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md shadow-card md:flex-row md:items-center">
      <div className="flex flex-wrap items-center gap-md">
        <p
          role="status"
          className="inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-badge-danger-bg px-md py-xs text-label-md text-badge-danger-fg"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-error motion-safe:animate-pulse" />
          Waiting for {namesList(awaiting)} to join
        </p>
        <span className="inline-flex items-center gap-xs text-label-md text-on-surface-variant">
          <UsersIcon size={18} />
          {maxParticipants && maxParticipants > 2
            ? `Conversation room for ${maxParticipants}`
            : '1:1 conversation room'}
        </span>
      </div>
      <div className="flex items-center gap-md">
        <ElapsedTimer startedAt={null} />
        {local ? (
          <span className="hidden items-center gap-xs rounded-md border-2 border-outline-strong bg-badge-info-bg px-md py-xs text-label-sm text-badge-info-fg sm:inline-flex">
            <SignalIcon size={16} level={local.quality === ConnectionQuality.Poor ? 1 : 3} />
            {QUALITY_LABEL[local.quality]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The waiting room, before anyone else has connected: the session bar, the
 * caller's own preview, level meter and waiting status on the left, and the
 * scenario — shared situation and private briefing — on the right. A normal
 * scrolling page, so nothing is ever clipped below the fold.
 */
export function WaitingPanel({ awaiting, local, scenario, maxParticipants }: WaitingPanelProps) {
  const level = useAudioLevel(local?.audioPublication?.track?.mediaStreamTrack);
  const notYetJoined =
    awaiting.length === 0
      ? 'Nobody else has joined yet'
      : `${namesList(awaiting)} ${awaiting.length > 1 ? "haven't" : "hasn't"} joined yet`;

  return (
    <div className="flex flex-col gap-lg">
      <SessionBar awaiting={awaiting} local={local} maxParticipants={maxParticipants} />

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-12">
        <div className="flex flex-col gap-lg lg:col-span-4">
          <section className="flex flex-col gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-xs text-label-lg text-on-surface">
                <CameraIcon size={18} />
                Your video preview
              </h2>
              <span className="rounded-full border border-outline-strong bg-badge-success-bg px-sm py-xs text-label-sm text-badge-success-fg">
                Live
              </span>
            </div>
            {local ? <ParticipantTile participant={local} size="card" /> : null}
            <Meter
              value={level ?? 0}
              state={level === null ? 'warming-up' : 'scored'}
              label="Microphone level"
            />
            <div className="flex flex-col items-center gap-xs rounded-md border-2 border-dashed border-outline-strong bg-surface-container p-md text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-outline-strong bg-badge-info-bg shadow-button">
                <RefreshIcon size={20} className="motion-safe:animate-spin" />
              </span>
              <p className="text-title-md text-on-surface">{notYetJoined}</p>
              <p className="max-w-64 text-body-sm text-on-surface-variant">
                They&apos;ll see this situation, and get their own role card, the moment they join.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-highest p-md shadow-card">
            <h2 className="flex items-center gap-xs text-label-lg text-on-surface">
              <VerifiedIcon size={18} />
              Session reminders
            </h2>
            <ul className="list-inside list-disc space-y-xs text-body-sm text-on-surface-variant">
              <li>
                Speak only <strong>English</strong> during the roleplay.
              </li>
              <li>Keep your objective to yourself — let the others discover it.</li>
              <li>Work the expressions on your card in naturally.</li>
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-lg lg:col-span-8">
          <ScenarioRegion scenario={scenario} />
        </div>
      </div>
    </div>
  );
}
