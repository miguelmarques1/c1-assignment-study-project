import { ParticipantTile } from './participant-tile';
import type { ParticipantView } from './use-classroom-room';

export interface ParticipantGridProps {
  participants: ParticipantView[];
}

/**
 * The local tile is always the small floating inset — at the default cap
 * that reads as "two tiles" (one large remote, one small local); above it,
 * remotes form a uniform grid with the same inset local tile over it.
 */
export function ParticipantGrid({ participants }: ParticipantGridProps) {
  const local = participants.find((p) => p.isLocal);
  const remotes = participants.filter((p) => !p.isLocal);
  const uniform = remotes.length > 1;

  return (
    <div className="relative h-full w-full">
      <div className={uniform ? 'grid grid-cols-2 gap-sm' : 'flex h-full items-center justify-center'}>
        {remotes.map((participant) => (
          <ParticipantTile key={participant.identity} participant={participant} size="large" />
        ))}
      </div>
      {local ? (
        <div className="absolute bottom-md right-md w-40">
          <ParticipantTile participant={local} size="small" />
        </div>
      ) : null}
    </div>
  );
}
