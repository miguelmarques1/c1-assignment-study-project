'use client';

import type { TrackPublication } from 'livekit-client';
import { useEffect, useRef } from 'react';

import type { ParticipantView } from './use-classroom-room';

function RemoteAudioTrack({ publication, muted }: { publication: TrackPublication; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    const track = publication.track;
    if (!track || !element) {
      return;
    }
    // `attach` is what actually plays a remote track in livekit-client — a
    // subscribed audio track with no element is silent. The room's own
    // `switchActiveDevice('audiooutput')` routes every attached element.
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [publication]);

  // No captioning source exists for a remote participant's real-time WebRTC audio.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio ref={ref} autoPlay muted={muted} />;
}

export interface RemoteAudioProps {
  participants: ParticipantView[];
  /** The top bar's `Sound` toggle — silences playback without unsubscribing. */
  muted: boolean;
}

/** One hidden `<audio>` per remote participant's microphone. */
export function RemoteAudio({ participants, muted }: RemoteAudioProps) {
  return (
    <div hidden>
      {participants
        .filter((participant) => !participant.isLocal && participant.audioPublication?.track)
        .map((participant) => (
          <RemoteAudioTrack
            key={participant.identity}
            publication={participant.audioPublication!}
            muted={muted}
          />
        ))}
    </div>
  );
}
