'use client';

import type { TrackPublication } from 'livekit-client';
import { useEffect, useRef } from 'react';

import { Avatar, Badge, cn } from '@/components/ui';
import { ConnectionQualityIndicator } from './connection-quality';
import type { ParticipantView } from './use-classroom-room';

function useAttachedTrack(publication: TrackPublication | null) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    const track = publication?.track;
    if (!track || !element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [publication]);

  return ref;
}

export interface ParticipantTileProps {
  participant: ParticipantView;
  /** The size variant — the local tile is smaller at the default two-participant cap. */
  size: 'large' | 'small';
}

/** Attaches the video track or renders initials, shows the mute badge and the name. */
export function ParticipantTile({ participant, size }: ParticipantTileProps) {
  const videoRef = useAttachedTrack(participant.videoPublication);
  const showVideo = Boolean(participant.videoPublication) && !participant.cameraOff;

  return (
    <div
      className={cn(
        'relative aspect-video overflow-hidden rounded-lg border-2 border-outline-strong bg-surface-container-highest',
        size === 'large' ? 'w-full' : 'w-full max-w-64',
      )}
    >
      {showVideo ? (
        // No captioning source exists for a remote participant's real-time WebRTC audio.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          muted={participant.isLocal}
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Avatar
            displayName={participant.displayName}
            email={participant.identity}
            size={size === 'large' ? 64 : 40}
          />
        </div>
      )}

      <div className="absolute bottom-sm left-sm flex items-center gap-xs">
        <span className="rounded-md bg-surface-container-lowest px-sm py-xs text-label-sm text-on-surface">
          {participant.displayName}
          {participant.isLocal ? ' (you)' : ''}
        </span>
        {participant.muted ? <Badge status="neutral">Muted</Badge> : null}
      </div>

      {!participant.isLocal ? (
        <div className="absolute top-sm right-sm">
          <ConnectionQualityIndicator quality={participant.quality} />
        </div>
      ) : null}
    </div>
  );
}
