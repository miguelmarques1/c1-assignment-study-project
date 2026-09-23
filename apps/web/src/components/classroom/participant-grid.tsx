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
  const speaking = remotes.find((p) => p.isSpeaking);

  return (
    <div className="relative w-full">
      <div className={uniform ? 'grid grid-cols-2 gap-sm' : 'w-full'}>
        {remotes.map((participant) => (
          <ParticipantTile key={participant.identity} participant={participant} size="large" />
        ))}
      </div>
      {speaking ? (
        <p
          role="status"
          className="absolute top-md left-md inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-surface-container-lowest px-md py-xs text-label-sm uppercase tracking-wide text-on-surface"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-secondary motion-safe:animate-ping" />
          {speaking.displayName} is speaking…
        </p>
      ) : null}
      {local ? (
        <div className="absolute right-md bottom-md w-40 sm:w-52">
          <ParticipantTile participant={local} size="small" />
        </div>
      ) : null}
    </div>
  );
}
