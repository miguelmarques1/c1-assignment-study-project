'use client';

import {
  ConnectionQuality,
  LocalParticipant,
  Room,
  RoomEvent,
  type Participant,
  type ReconnectContext,
  type ReconnectPolicy,
  type TrackPublication,
} from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

import { requestClassroomToken } from '@/lib/classroom';

/** The product's boundary, not the SDK default (which keeps retrying well past it). */
const RECONNECT_WINDOW_MS = 30_000;
/** One hour of margin inside the 6-hour TTL, per the spec's token-refresh assumption. */
const REFRESH_BEFORE_EXPIRY_MS = 60 * 60 * 1000;

class BoundedReconnectPolicy implements ReconnectPolicy {
  nextRetryDelayInMs(context: ReconnectContext): number | null {
    if (context.elapsedMs >= RECONNECT_WINDOW_MS) {
      return null;
    }
    return Math.min(300 * 2 ** context.retryCount, 3000);
  }
}

export interface ParticipantView {
  identity: string;
  displayName: string;
  isLocal: boolean;
  muted: boolean;
  cameraOff: boolean;
  quality: ConnectionQuality;
  videoPublication: TrackPublication | null;
}

export type RoomPhase = 'connecting' | 'connected' | 'reconnecting' | 'left';

function toView(participant: Participant): ParticipantView {
  const publications = [...participant.trackPublications.values()];
  const videoPublication = publications.find((pub) => pub.kind === 'video') ?? null;
  const audioPublication = publications.find((pub) => pub.kind === 'audio') ?? null;

  return {
    identity: participant.identity,
    displayName: participant.name || participant.identity,
    isLocal: participant instanceof LocalParticipant,
    muted: !audioPublication || audioPublication.isMuted,
    cameraOff: !videoPublication || videoPublication.isMuted,
    quality: participant.connectionQuality,
    videoPublication,
  };
}

export interface UseClassroomRoom {
  phase: RoomPhase;
  participants: ParticipantView[];
  reconnectSecondsLeft: number | null;
  connect: (params: { url: string; token: string; expiresAt: string }) => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
}

/**
 * Wraps a `livekit-client` Room: participants, track publications, mute
 * state, per-participant connection quality and the reconnection phase.
 * Installs the 30-second reconnect policy and the token refresh here.
 */
export function useClassroomRoom(): UseClassroomRoom {
  const roomRef = useRef<Room | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshing = useRef(false);

  const [phase, setPhase] = useState<RoomPhase>('connecting');
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [reconnectSecondsLeft, setReconnectSecondsLeft] = useState<number | null>(null);

  const refreshParticipants = useCallback((room: Room) => {
    setParticipants([room.localParticipant, ...room.remoteParticipants.values()].map(toView));
  }, []);

  const scheduleRefresh = useCallback((expiresAt: string, url: string) => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
    }

    const delay = new Date(expiresAt).getTime() - Date.now() - REFRESH_BEFORE_EXPIRY_MS;
    if (delay <= 0) {
      return;
    }

    refreshTimer.current = setTimeout(() => {
      void (async () => {
        const room = roomRef.current;
        if (!room) return;

        const fresh = await requestClassroomToken();
        refreshing.current = true;
        try {
          await room.disconnect();
          await room.connect(url, fresh.token);
          setPhase('connected');
          refreshParticipants(room);
        } finally {
          refreshing.current = false;
        }
        scheduleRefresh(fresh.expiresAt, url);
      })();
    }, delay);
  }, [refreshParticipants]);

  const connect = useCallback(
    async ({ url, token, expiresAt }: { url: string; token: string; expiresAt: string }) => {
      const room = new Room({ reconnectPolicy: new BoundedReconnectPolicy() });
      roomRef.current = room;

      const onChanged = () => refreshParticipants(room);

      room
        .on(RoomEvent.ParticipantConnected, onChanged)
        .on(RoomEvent.ParticipantDisconnected, onChanged)
        .on(RoomEvent.TrackSubscribed, onChanged)
        .on(RoomEvent.TrackUnsubscribed, onChanged)
        .on(RoomEvent.TrackMuted, onChanged)
        .on(RoomEvent.TrackUnmuted, onChanged)
        .on(RoomEvent.LocalTrackPublished, onChanged)
        .on(RoomEvent.LocalTrackUnpublished, onChanged)
        .on(RoomEvent.ConnectionQualityChanged, onChanged)
        .on(RoomEvent.Reconnecting, () => {
          if (refreshing.current) return;
          setPhase('reconnecting');
          const startedAt = Date.now();
          setReconnectSecondsLeft(Math.ceil(RECONNECT_WINDOW_MS / 1000));
          const tick = setInterval(() => {
            const left = Math.max(0, Math.ceil((RECONNECT_WINDOW_MS - (Date.now() - startedAt)) / 1000));
            setReconnectSecondsLeft(left);
            if (left <= 0) clearInterval(tick);
          }, 1000);
        })
        .on(RoomEvent.Reconnected, () => {
          if (refreshing.current) return;
          setReconnectSecondsLeft(null);
          setPhase('connected');
        })
        .on(RoomEvent.Disconnected, () => {
          if (refreshing.current) return;
          setReconnectSecondsLeft(null);
          setPhase('left');
        });

      setPhase('connecting');
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);
      setPhase('connected');
      refreshParticipants(room);
      scheduleRefresh(expiresAt, url);
    },
    [refreshParticipants, scheduleRefresh],
  );

  const disconnect = useCallback(async () => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
    }
    await roomRef.current?.disconnect();
    roomRef.current = null;
  }, []);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    refreshParticipants(room);
  }, [refreshParticipants]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    refreshParticipants(room);
  }, [refreshParticipants]);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
      void roomRef.current?.disconnect();
    };
  }, []);

  return { phase, participants, reconnectSecondsLeft, connect, disconnect, toggleMicrophone, toggleCamera };
}
