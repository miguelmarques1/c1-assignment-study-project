'use client';

import type { TrackPublication } from 'livekit-client';
import { useEffect, useRef } from 'react';

import { Avatar, Badge, cn, MicrophoneIcon } from '@/components/ui';
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

export type ParticipantTileSize = 'large' | 'card' | 'small';

const SIZE_CLASSES: Record<ParticipantTileSize, string> = {
  // The main stage: fills its column at the mockup's 16:9.
  large: 'aspect-video w-full rounded-lg shadow-card',
  // The waiting room's own-preview card: fills the card's width.
  card: 'aspect-video w-full rounded-md',
  // The floating picture-in-picture inset over the stage.
  small: 'aspect-video w-full max-w-64 rounded-md shadow-button',
};

export interface ParticipantTileProps {
  participant: ParticipantView;
  size: ParticipantTileSize;
}

/** Attaches the video track or renders initials, shows the mute badge and the name. */
export function ParticipantTile({ participant, size }: ParticipantTileProps) {
  const videoRef = useAttachedTrack(participant.videoPublication);
  const showVideo = Boolean(participant.videoPublication) && !participant.cameraOff;

  return (
    <div
      className={cn(
        'relative overflow-hidden border-2 border-outline-strong bg-surface-container-highest',
        SIZE_CLASSES[size],
      )}
    >
      {showVideo ? (
        // No captioning source exists for a remote participant's real-time WebRTC audio.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          muted={participant.isLocal}
          playsInline
          className={cn('h-full w-full object-cover', participant.isLocal && '-scale-x-100')}
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
        <span className="inline-flex items-center gap-xs rounded-md border border-outline-strong bg-surface-container-lowest px-sm py-xs text-label-sm text-on-surface">
          {size === 'large' && !participant.muted ? <MicrophoneIcon size={14} /> : null}
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
