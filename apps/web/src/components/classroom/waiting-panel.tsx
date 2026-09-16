import type { ClassroomAwaiting } from '@english-quest/shared';

import { Card, Meter, Stack } from '@/components/ui';
import { ParticipantTile } from './participant-tile';
import { useAudioLevel } from './use-audio-level';
import type { ParticipantView } from './use-classroom-room';

export interface WaitingPanelProps {
  awaiting: ClassroomAwaiting[];
  /** The caller's own participant view, for the live local preview and level meter. */
  local: ParticipantView | null;
}

/** Lists every other account with a seat available that is not yet connected, capped at the remaining seats. */
function namesList(awaiting: ClassroomAwaiting[]): string {
  const names = awaiting.map((entry) => entry.displayName);
  if (names.length === 0) {
    return 'others to join';
  }
  if (names.length === 1) {
    return `${names[0]} to join`;
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} to join`;
}

/**
 * `Waiting for {names} to join`, with a live local preview and level meter,
 * plus the labelled region F06 mounts its scenario into.
 */
export function WaitingPanel({ awaiting, local }: WaitingPanelProps) {
  const level = useAudioLevel(local?.audioPublication?.track?.mediaStreamTrack);

  return (
    <Stack gap="md" align="center" className="p-lg text-center">
      <p role="status" className="text-title-md text-on-surface">
        Waiting for {namesList(awaiting)}
      </p>
      {local ? (
        <div className="w-full max-w-64">
          <ParticipantTile participant={local} size="small" />
        </div>
      ) : null}
      <div className="w-full max-w-64">
        <Meter value={level ?? 0} state={level === null ? 'warming-up' : 'scored'} label="Microphone level" />
      </div>
      <Card aria-label="Scenario" className="min-h-24 w-full">
        {/* F06 mounts the waiting-area scenario panel here. */}
      </Card>
    </Stack>
  );
}
