'use client';

import { ERROR_CODES, type ClassroomSession } from '@english-quest/shared';
import { ConnectionQuality } from 'livekit-client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button, ErrorState, LoadingState } from '@/components/ui';
import { ApiRequestError } from '@/lib/api-client';
import {
  endLesson as endLessonRequest,
  fetchClassroomSession,
  requestClassroomToken,
} from '@/lib/classroom';
import { ClassroomHeader } from './classroom-header';
import { UnstableConnectionBanner } from './connection-quality';
import { ControlBar } from './control-bar';
import { DevicePreview } from './device-preview';
import { DeviceSelect } from './device-select';
import { EndLessonDialog } from './end-lesson-dialog';
import { ParticipantGrid } from './participant-grid';
import { ReconnectingOverlay } from './reconnecting-overlay';
import { useClassroomRoom } from './use-classroom-room';
import { useMediaPreview } from './use-media-preview';
import { WaitingPanel } from './waiting-panel';

const SESSION_POLL_MS = 3000;

type ScreenPhase = 'preview' | 'connecting' | 'call' | 'ended' | 'full' | 'unavailable';

export interface ClassroomScreenProps {
  displayName: string;
}

/** Owns the permission → preview → waiting → live → ended machine, the API calls and the error surfaces. */
export function ClassroomScreen({ displayName }: ClassroomScreenProps) {
  const router = useRouter();
  const preview = useMediaPreview();
  const room = useClassroomRoom();

  const [phase, setPhase] = useState<ScreenPhase>('preview');
  const [session, setSession] = useState<ClassroomSession>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);

  const pollSession = useCallback(async () => {
    try {
      setSession(await fetchClassroomSession());
    } catch {
      // Transient; the next tick retries.
    }
  }, []);

  useEffect(() => {
    if (phase !== 'call') {
      return;
    }
    void pollSession();
    const timer = setInterval(() => void pollSession(), SESSION_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, pollSession]);

  useEffect(() => {
    if (phase === 'call' && room.phase === 'left') {
      setPhase('ended');
      router.push('/dashboard');
    }
  }, [room.phase, phase, router]);

  async function handleJoin() {
    setPhase('connecting');
    try {
      const token = await requestClassroomToken();
      preview.release();
      await room.connect({ url: token.url, token: token.token, expiresAt: token.expiresAt });
      setCap(token.maxParticipants);
      setPhase('call');
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === ERROR_CODES.CLASSROOM_FULL) {
        const details = error.details as { maxParticipants?: number } | null;
        setCap(details?.maxParticipants ?? null);
        setPhase('full');
        return;
      }
      if (error instanceof ApiRequestError && error.code === ERROR_CODES.CLASSROOM_UNAVAILABLE) {
        const details = error.details as { reason?: string } | null;
        setUnavailableReason(details?.reason ?? null);
        setPhase('unavailable');
        return;
      }
      setUnavailableReason(null);
      setPhase('unavailable');
    }
  }

  async function handleEndLesson() {
    if (!session) {
      return;
    }
    await endLessonRequest(session.lessonId);
    await room.disconnect();
    setEndDialogOpen(false);
    setPhase('ended');
    router.push('/dashboard');
  }

  if (phase === 'preview' && preview.microphoneDenied) {
    return (
      <ErrorState
        title="Microphone access needed"
        description="English Quest needs microphone access to run a lesson."
        onRetry={preview.retry}
      />
    );
  }

  if (phase === 'full') {
    return (
      <ErrorState
        title="Classroom full"
        description={`This classroom is full (${cap ?? '—'} participants).`}
        onRetry={handleJoin}
      />
    );
  }

  if (phase === 'unavailable') {
    return (
      <ErrorState
        title="The classroom is unavailable right now."
        description={unavailableReason ?? 'Please try again.'}
        onRetry={handleJoin}
      />
    );
  }

  if (phase === 'preview') {
    if (preview.status === 'requesting') {
      return <LoadingState variant="card-grid" label="Requesting camera and microphone access" />;
    }
    return (
      <div className="flex flex-col gap-lg">
        <DevicePreview
          displayName={displayName}
          videoTrack={preview.videoTrack}
          cameraDenied={preview.cameraDenied}
          level={preview.level}
          devices={preview.devices}
          selectedDeviceId={preview.selectedDeviceId}
          onSelectDevice={preview.selectDevice}
        />
        <Button size="lg" onClick={() => void handleJoin()}>
          Join classroom
        </Button>
      </div>
    );
  }

  if (phase === 'connecting') {
    return <LoadingState variant="card-grid" label="Connecting to the classroom" />;
  }

  const local = room.participants.find((participant) => participant.isLocal);
  const hasRemote = room.participants.some((participant) => !participant.isLocal);
  const unstable = room.participants.some(
    (participant) =>
      !participant.isLocal &&
      (participant.quality === ConnectionQuality.Poor || participant.quality === ConnectionQuality.Lost),
  );

  return (
    <div className="flex h-screen flex-col">
      <ClassroomHeader startedAt={session?.startedAt ?? null} />
      <div className="relative flex-1 overflow-hidden p-md">
        {unstable ? <UnstableConnectionBanner /> : null}
        {hasRemote ? (
          <ParticipantGrid participants={room.participants} />
        ) : (
          <WaitingPanel awaiting={session?.awaiting ?? []} local={local ?? null} />
        )}
        {deviceSettingsOpen ? (
          <div className="absolute bottom-md left-md flex w-64 flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md shadow-modal">
            <DeviceSelect
              label="Microphone"
              devices={preview.devices.audioinput}
              selectedDeviceId={preview.selectedDeviceId.audioinput}
              onChange={(deviceId) => void preview.selectDevice('audioinput', deviceId)}
            />
            <DeviceSelect
              label="Camera"
              devices={preview.devices.videoinput}
              selectedDeviceId={preview.selectedDeviceId.videoinput}
              onChange={(deviceId) => void preview.selectDevice('videoinput', deviceId)}
            />
            <DeviceSelect
              label="Speaker"
              devices={preview.devices.audiooutput}
              selectedDeviceId={preview.selectedDeviceId.audiooutput}
              onChange={(deviceId) => void preview.selectDevice('audiooutput', deviceId)}
            />
          </div>
        ) : null}
        <ReconnectingOverlay secondsLeft={room.reconnectSecondsLeft} />
      </div>
      <ControlBar
        microphoneEnabled={!(local?.muted ?? false)}
        cameraEnabled={!(local?.cameraOff ?? false)}
        onToggleMicrophone={() => void room.toggleMicrophone()}
        onToggleCamera={() => void room.toggleCamera()}
        onOpenDeviceSettings={() => setDeviceSettingsOpen((open) => !open)}
        onEndLesson={() => setEndDialogOpen(true)}
      />
      <EndLessonDialog
        open={endDialogOpen}
        onCancel={() => setEndDialogOpen(false)}
        onConfirm={handleEndLesson}
      />
    </div>
  );
}
