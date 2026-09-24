'use client';

import { ERROR_CODES, type ClassroomAwaiting, type ClassroomSession, type LiveRecording } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button, ErrorState, LoadingState } from '@/components/ui';
import { ApiRequestError } from '@/lib/api-client';
import {
  endLesson as endLessonRequest,
  fetchClassroomSession,
  requestClassroomToken,
} from '@/lib/classroom';
import { fetchLessonRecording } from '@/lib/recording';
import { ControlBar } from './control-bar';
import { DeviceSelect } from './device-select';
import { EndLessonDialog } from './end-lesson-dialog';
import { LessonEndedNotice } from './lesson-ended-notice';
import { LiveStage } from './live-stage';
import { PreCallScreen } from './pre-call-screen';
import { ReconnectingOverlay } from './reconnecting-overlay';
import { RemoteAudio } from './remote-audio';
import { useClassroomRoom } from './use-classroom-room';
import { useMediaPreview } from './use-media-preview';
import { useScenario } from './use-scenario';
import { WaitingPanel } from './waiting-panel';

/** The lesson-wide default before the first `GET /classroom/session` response arrives. */
const IDLE_RECORDING: LiveRecording = {
  status: 'idle',
  since: null,
  mine: { status: 'not_started', capturedSeconds: 0 },
};

const SESSION_POLL_MS = 3000;

/**
 * Development only: an embedded preview browser can leave the permission
 * prompt unanswered forever, or deny devices outright. After this long the
 * blocked screen offers to continue without media so the rest of the flow
 * stays testable there. F05 requires a denied microphone to block the
 * connection, so none of this exists in a production build or under test.
 */
const MEDIA_BYPASS_AVAILABLE = process.env.NODE_ENV === 'development';
const MEDIA_STALL_MS = 8000;

type ScreenPhase = 'preview' | 'connecting' | 'call' | 'ended' | 'full' | 'unavailable';

/**
 * Everyone the waiting room is waiting for: accounts with a registered seat
 * that are not connected yet, then accounts with no seat at all.
 */
function notYetConnected(session: ClassroomSession, userId: string): ClassroomAwaiting[] {
  if (!session) {
    return [];
  }
  return [
    ...session.participants
      .filter((participant) => participant.userId !== userId && !participant.connected)
      .map(({ userId: id, displayName }) => ({ userId: id, displayName })),
    ...session.awaiting.filter((account) => account.userId !== userId),
  ];
}

export interface ClassroomScreenProps {
  /** Excluded from the pre-call screen's "who else is here". */
  userId: string;
}

/** Owns the permission → preview → waiting → live → ended machine, the API calls and the error surfaces. */
export function ClassroomScreen({ userId }: ClassroomScreenProps) {
  const router = useRouter();
  const preview = useMediaPreview();
  const room = useClassroomRoom();

  const [phase, setPhase] = useState<ScreenPhase>('preview');
  const [session, setSession] = useState<ClassroomSession>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [mediaStalled, setMediaStalled] = useState(false);
  const [withoutMedia, setWithoutMedia] = useState(false);
  const [capEndedNotice, setCapEndedNotice] = useState(false);
  // Development only: the no-media path also tolerates a media server the
  // browser cannot reach (the embedded preview has no working WebRTC), so
  // the waiting room — scenario, reroll, role card — stays testable there.
  const [mediaOffline, setMediaOffline] = useState(false);

  // Polls while the lesson is still waiting to start; stops for good once
  // `lessons.started_at` is set — the scenario is immutable from then on, so
  // continuing to poll could never return anything new (spec's Technical
  // Decision on the in-call panel).
  const scenario = useScenario(phase === 'call' && !session?.startedAt);

  const pollSession = useCallback(async () => {
    try {
      setSession(await fetchClassroomSession());
    } catch {
      // Transient; the next tick retries.
    }
  }, []);

  // One read on arrival, for the pre-call screen's "who else is here".
  useEffect(() => {
    void pollSession();
  }, [pollSession]);

  useEffect(() => {
    if (phase !== 'call') {
      return;
    }
    void pollSession();
    const timer = setInterval(() => void pollSession(), SESSION_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, pollSession]);

  // LiveKit's own recording-status flag flipping is the trigger, but the
  // session read is the source of truth — this is what keeps the indicator
  // within the 3-second criterion without shortening the regular poll.
  useEffect(() => {
    if (phase !== 'call' || room.recordingSignal === 0) {
      return;
    }
    void pollSession();
  }, [room.recordingSignal, phase, pollSession]);

  useEffect(() => {
    if (phase !== 'call' || room.phase !== 'left' || mediaOffline) {
      return;
    }
    let cancelled = false;

    void (async () => {
      // The classroom's own session is already gone once the room is left —
      // the recording view is what still carries *why* the lesson ended.
      let endedByCap = false;
      if (session?.lessonId) {
        try {
          const view = await fetchLessonRecording(session.lessonId);
          endedByCap = view.endReason === 'max_duration';
        } catch {
          // Transient — falls through to the normal redirect.
        }
      }
      if (cancelled) {
        return;
      }
      setPhase('ended');
      if (endedByCap) {
        setCapEndedNotice(true);
      } else {
        router.push('/dashboard');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room.phase, phase, router, mediaOffline, session?.lessonId]);

  useEffect(() => {
    if (!MEDIA_BYPASS_AVAILABLE || preview.status !== 'requesting') {
      setMediaStalled(false);
      return;
    }
    const timer = setTimeout(() => setMediaStalled(true), MEDIA_STALL_MS);
    return () => clearTimeout(timer);
  }, [preview.status]);

  async function handleJoin() {
    setPhase('connecting');
    let issuedCap: number | null = null;
    try {
      const token = await requestClassroomToken();
      issuedCap = token.maxParticipants;
      const choices = {
        microphoneEnabled: preview.microphoneEnabled,
        cameraEnabled: preview.cameraEnabled,
        devices: preview.selectedDeviceId,
      };
      preview.release();
      await room.connect({
        url: token.url,
        token: token.token,
        expiresAt: token.expiresAt,
        ...(withoutMedia ? { withoutMedia: true } : choices),
      });
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
      if (MEDIA_BYPASS_AVAILABLE && withoutMedia && issuedCap !== null) {
        // The token was issued — the seat is registered and the scenario is
        // generating — but the media connection itself failed.
        setCap(issuedCap);
        setMediaOffline(true);
        setPhase('call');
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

  const blocked =
    phase === 'preview' && !withoutMedia && (preview.microphoneDenied || mediaStalled);

  if (blocked) {
    return (
      <div className="flex flex-col items-center gap-md">
        <ErrorState
          title="Microphone access needed"
          description="English Quest needs microphone access to run a lesson."
          onRetry={preview.retry}
        />
        {MEDIA_BYPASS_AVAILABLE ? (
          <div className="flex flex-col items-center gap-xs text-center">
            <Button variant="neutral" onClick={() => setWithoutMedia(true)}>
              Continue without camera or microphone
            </Button>
            <p className="text-body-sm text-on-surface-variant">
              Development only — for browsers that cannot grant devices.
            </p>
          </div>
        ) : null}
      </div>
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

  if (phase === 'ended' && capEndedNotice) {
    return <LessonEndedNotice onReturnToDashboard={() => router.push('/dashboard')} />;
  }

  if (phase === 'preview') {
    if (preview.status === 'requesting' && !withoutMedia) {
      return <LoadingState variant="card-grid" label="Requesting camera and microphone access" />;
    }
    return (
      <PreCallScreen
        userId={userId}
        preview={preview}
        session={session}
        noMedia={withoutMedia}
        onJoin={() => void handleJoin()}
      />
    );
  }

  if (phase === 'connecting') {
    return <LoadingState variant="card-grid" label="Connecting to the classroom" />;
  }

  const local = room.participants.find((participant) => participant.isLocal);
  const hasRemote = room.participants.some((participant) => !participant.isLocal);

  return (
    <div className="flex flex-col gap-lg">
      {mediaOffline ? (
        <p
          role="status"
          className="rounded-md border-2 border-outline-strong bg-badge-warning-bg px-md py-sm text-body-sm text-badge-warning-fg"
        >
          Development mode: this browser could not reach the media server, so the room is shown
          without audio or video. The scenario and the lesson itself are real.
        </p>
      ) : null}
      {hasRemote ? (
        <LiveStage
          participants={room.participants}
          startedAt={session?.startedAt ?? null}
          scenario={scenario}
          briefOpen={scenarioPanelOpen}
          onCloseBrief={() => setScenarioPanelOpen(false)}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((on) => !on)}
          recording={session?.recording ?? IDLE_RECORDING}
        />
      ) : (
        <WaitingPanel
          awaiting={notYetConnected(session, userId)}
          local={local ?? null}
          scenario={scenario}
          maxParticipants={cap}
        />
      )}
      <RemoteAudio participants={room.participants} muted={!soundOn} />
      <ControlBar
        microphoneEnabled={!(local?.muted ?? false)}
        cameraEnabled={!(local?.cameraOff ?? false)}
        onToggleMicrophone={() => void room.toggleMicrophone()}
        onToggleCamera={() => void room.toggleCamera()}
        onOpenDeviceSettings={() => setDeviceSettingsOpen((open) => !open)}
        deviceSettings={
          deviceSettingsOpen ? (
            <>
              <DeviceSelect
                label="Microphone"
                devices={preview.devices.audioinput}
                selectedDeviceId={room.activeDeviceIds.audioinput}
                onChange={(deviceId) => void room.switchDevice('audioinput', deviceId)}
              />
              <DeviceSelect
                label="Camera"
                devices={preview.devices.videoinput}
                selectedDeviceId={room.activeDeviceIds.videoinput}
                onChange={(deviceId) => void room.switchDevice('videoinput', deviceId)}
              />
              <DeviceSelect
                label="Speaker"
                devices={preview.devices.audiooutput}
                selectedDeviceId={room.activeDeviceIds.audiooutput}
                onChange={(deviceId) => void room.switchDevice('audiooutput', deviceId)}
              />
            </>
          ) : null
        }
        onEndLesson={() => setEndDialogOpen(true)}
        scenarioPanelOpen={scenarioPanelOpen}
        onToggleScenarioPanel={() => setScenarioPanelOpen((open) => !open)}
        scenarioAlwaysShown={!hasRemote}
      />
      <ReconnectingOverlay secondsLeft={room.reconnectSecondsLeft} />
      <EndLessonDialog
        open={endDialogOpen}
        onCancel={() => setEndDialogOpen(false)}
        onConfirm={handleEndLesson}
        recording={session?.recording ?? IDLE_RECORDING}
      />
    </div>
  );
}
