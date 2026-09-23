'use client';

import type { ClassroomSession } from '@english-quest/shared';
import type { LocalVideoTrack } from 'livekit-client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  ArrowRightIcon,
  Avatar,
  Badge,
  CameraIcon,
  CameraOffIcon,
  CheckCircleIcon,
  MicrophoneIcon,
  MicrophoneOffIcon,
  SettingsIcon,
  UsersIcon,
  VolumeIcon,
} from '@/components/ui';
import { DeviceSelect } from './device-select';
import { LevelBars } from './level-bars';
import type { UseMediaPreview } from './use-media-preview';

/** Above this level (0-100) the input counts as a voice rather than room noise. */
const VOICE_THRESHOLD = 12;
const VOICE_HOLD_MS = 1500;

function useAttachedVideo(track: LocalVideoTrack | null) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!track || !element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return ref;
}

/** Holds "heard you" for a moment after the last loud frame, so the label doesn't flicker per syllable. */
function useVoiceDetected(level: number | null): boolean {
  const [heardAt, setHeardAt] = useState(0);

  useEffect(() => {
    if ((level ?? 0) > VOICE_THRESHOLD) {
      setHeardAt(Date.now());
    }
  }, [level]);

  return heardAt > 0 && Date.now() - heardAt < VOICE_HOLD_MS;
}

/** A short tone on the chosen output, where the browser lets a page pick one. */
async function playTestTone(sinkId: string | undefined): Promise<void> {
  if (typeof AudioContext === 'undefined') {
    return;
  }
  const context = new AudioContext() as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (sinkId && context.setSinkId) {
    try {
      await context.setSinkId(sinkId);
    } catch {
      // Falls back to the default output.
    }
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 440;
  gain.gain.value = 0.15;
  oscillator.connect(gain).connect(context.destination);
  oscillator.onended = () => void context.close();
  oscillator.start();
  oscillator.stop(context.currentTime + 0.8);
}

function StatusDot({ tone, children }: { tone: 'ok' | 'off'; children: string }) {
  return (
    <span
      className={`inline-flex items-center gap-xs text-label-sm ${tone === 'ok' ? 'text-tertiary' : 'text-on-surface-variant'}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${tone === 'ok' ? 'bg-badge-success-bg' : 'bg-outline'}`}
      />
      {children}
    </span>
  );
}

interface StageProps {
  preview: UseMediaPreview;
  noMedia: boolean;
  voiceDetected: boolean;
}

/** The camera preview with the mockup's overlays and its floating mic/camera toggles. */
function PreviewStage({ preview, noMedia, voiceDetected }: StageProps) {
  const videoRef = useAttachedVideo(preview.videoTrack);
  const cameraAvailable = Boolean(preview.videoTrack) && !preview.cameraDenied && !noMedia;
  const showVideo = cameraAvailable && preview.cameraEnabled;
  const microphoneAvailable = Boolean(preview.audioTrack) && !noMedia;
  const level = preview.level ?? 0;

  const cameraLabel = !cameraAvailable ? 'Camera unavailable' : preview.cameraEnabled ? 'Camera on' : 'Camera off';

  return (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border-2 border-outline-strong bg-surface-container-highest shadow-card sm:aspect-16/10">
      {showVideo ? (
        <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-sm p-md pb-xl text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-container-lowest shadow-button">
            <CameraOffIcon size={36} />
          </span>
          <p className="text-title-md text-on-surface">
            {cameraAvailable ? 'Your camera is off' : 'No camera available'}
          </p>
          <p className="max-w-64 text-body-sm text-on-surface-variant">
            The others will see your initials when you join.
          </p>
        </div>
      )}

      <span className="absolute top-md left-md inline-flex items-center gap-xs rounded-full border-2 border-outline-strong bg-surface-container-lowest px-md py-xs text-label-sm text-on-surface shadow-button">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${showVideo ? 'bg-badge-success-bg motion-safe:animate-pulse' : 'bg-outline'}`}
        />
        {cameraLabel}
      </span>

      <span
        role="status"
        className="absolute bottom-20 left-md inline-flex items-center gap-sm rounded-md border border-outline-strong bg-surface-container-lowest px-sm py-xs text-label-sm text-on-surface"
      >
        {microphoneAvailable && preview.microphoneEnabled ? <MicrophoneIcon size={16} /> : <MicrophoneOffIcon size={16} />}
        <span aria-hidden="true" className="flex h-3.5 w-12 items-end gap-xs">
          {[
            { at: 5, height: 'h-1.5' },
            { at: 20, height: 'h-3' },
            { at: 40, height: 'h-2' },
            { at: 60, height: 'h-3.5' },
          ].map((bar) => (
            <span
              key={bar.at}
              className={`w-1.5 rounded-full bg-badge-success-bg ${bar.height} ${level > bar.at ? 'opacity-100' : 'opacity-20'}`}
            />
          ))}
        </span>
        {!microphoneAvailable
          ? 'No microphone'
          : !preview.microphoneEnabled
            ? 'Microphone off'
            : voiceDetected
              ? 'Voice detected'
              : 'Listening…'}
      </span>

      <div className="absolute inset-x-0 bottom-md flex justify-center px-md">
        <div className="flex items-center gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-xs shadow-button">
          <button
            type="button"
            onClick={preview.toggleMicrophone}
            disabled={!microphoneAvailable}
            aria-label={preview.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!preview.microphoneEnabled}
            className={`flex h-11 w-11 items-center justify-center rounded-md border-2 border-outline-strong outline-offset-2 outline-outline-strong focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              preview.microphoneEnabled ? 'bg-surface-container' : 'bg-badge-danger-bg'
            }`}
          >
            {preview.microphoneEnabled ? <MicrophoneIcon size={22} /> : <MicrophoneOffIcon size={22} />}
          </button>
          <button
            type="button"
            onClick={preview.toggleCamera}
            disabled={!cameraAvailable}
            aria-label={preview.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            aria-pressed={!preview.cameraEnabled}
            className={`flex h-11 w-11 items-center justify-center rounded-md border-2 border-outline-strong outline-offset-2 outline-outline-strong focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              preview.cameraEnabled ? 'bg-surface-container' : 'bg-badge-danger-bg'
            }`}
          >
            {preview.cameraEnabled ? <CameraIcon size={22} /> : <CameraOffIcon size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MicrophoneLevelCard({ preview, noMedia, voiceDetected }: StageProps) {
  const available = Boolean(preview.audioTrack) && !noMedia;

  return (
    <section className="rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md shadow-card">
      <div className="mb-xs flex items-center justify-between gap-sm">
        <h2 className="flex items-center gap-sm text-title-md text-on-surface">
          <MicrophoneIcon size={20} />
          Microphone level
        </h2>
        {!available ? (
          <Badge status="danger">No microphone</Badge>
        ) : !preview.microphoneEnabled ? (
          <Badge status="neutral">Muted</Badge>
        ) : voiceDetected ? (
          <Badge status="success">Picking you up</Badge>
        ) : (
          <Badge status="neutral">Speak to test</Badge>
        )}
      </div>
      <p className="mb-sm text-body-sm text-on-surface-variant">
        Speak normally, at full volume, to check your microphone before the call.
      </p>
      <LevelBars level={available ? preview.level : null} label="Microphone input level" />
    </section>
  );
}

function DevicesCard({ preview, noMedia }: { preview: UseMediaPreview; noMedia: boolean }) {
  const [testing, setTesting] = useState(false);
  const detected =
    preview.devices.audioinput.length + preview.devices.videoinput.length + preview.devices.audiooutput.length;

  async function handleTestSound() {
    setTesting(true);
    await playTestTone(preview.selectedDeviceId.audiooutput);
    setTimeout(() => setTesting(false), 4000);
  }

  return (
    <section className="flex flex-col gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card">
      <div className="flex items-center justify-between gap-sm border-b-2 border-surface-container-highest pb-sm">
        <h2 className="flex items-center gap-xs text-title-lg text-on-surface">
          <SettingsIcon size={22} />
          Configure devices
        </h2>
        <span className="rounded-full border border-outline-strong bg-surface-container px-sm py-xs text-label-sm text-on-surface-variant">
          {detected} detected
        </span>
      </div>

      <DeviceSelect
        label="Microphone"
        devices={preview.devices.audioinput}
        selectedDeviceId={preview.selectedDeviceId.audioinput}
        onChange={(id) => void preview.selectDevice('audioinput', id)}
        disabled={noMedia}
        labelAside={
          preview.audioTrack && !noMedia ? (
            <StatusDot tone={preview.microphoneEnabled ? 'ok' : 'off'}>
              {preview.microphoneEnabled ? 'Active' : 'Muted'}
            </StatusDot>
          ) : (
            <StatusDot tone="off">Unavailable</StatusDot>
          )
        }
      />
      <DeviceSelect
        label="Camera"
        devices={preview.devices.videoinput}
        selectedDeviceId={preview.selectedDeviceId.videoinput}
        onChange={(id) => void preview.selectDevice('videoinput', id)}
        disabled={noMedia}
        labelAside={
          preview.videoTrack && !preview.cameraDenied && !noMedia ? (
            <StatusDot tone={preview.cameraEnabled ? 'ok' : 'off'}>
              {preview.cameraEnabled ? 'Ready' : 'Off'}
            </StatusDot>
          ) : (
            <StatusDot tone="off">Unavailable</StatusDot>
          )
        }
      />
      <DeviceSelect
        label="Speaker"
        devices={preview.devices.audiooutput}
        selectedDeviceId={preview.selectedDeviceId.audiooutput}
        onChange={(id) => void preview.selectDevice('audiooutput', id)}
        labelAside={
          <button
            type="button"
            onClick={() => void handleTestSound()}
            className="inline-flex items-center gap-xs text-label-sm text-secondary underline underline-offset-2"
          >
            <VolumeIcon size={14} />
            Test sound
          </button>
        }
      />
      {testing ? (
        <p
          role="status"
          className="rounded-md border-2 border-outline-strong bg-badge-info-bg px-sm py-xs text-body-sm text-badge-info-fg"
        >
          Playing a test tone — did you hear it clearly?
        </p>
      ) : null}
    </section>
  );
}

interface OtherPerson {
  id: string;
  name: string;
  status: string;
}

function othersFrom(session: ClassroomSession, userId: string): OtherPerson[] {
  if (!session) {
    return [];
  }
  return [
    ...session.participants
      .filter((participant) => participant.userId !== userId)
      .map((participant) => ({
        id: participant.userId,
        name: participant.displayName,
        status: participant.connected ? 'Already in the classroom' : 'Not connected right now',
      })),
    ...session.awaiting
      .filter((account) => account.userId !== userId)
      .map((account) => ({ id: account.userId, name: account.displayName, status: 'Not in the classroom yet' })),
  ];
}

interface JoinCardProps {
  session: ClassroomSession;
  userId: string;
  onJoin: () => void;
}

function JoinCard({ session, userId, onJoin }: JoinCardProps) {
  const others = othersFrom(session, userId);

  return (
    <section className="flex flex-col gap-md rounded-lg border-2 border-outline-strong bg-surface-container p-lg shadow-card">
      {others.length === 0 ? (
        <div className="flex items-center gap-md rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-badge-info-bg">
            <UsersIcon size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-title-md text-on-surface">The classroom is empty</p>
            <p className="text-body-sm text-on-surface-variant">
              You&apos;ll open it — your partner can join any time.
            </p>
          </div>
        </div>
      ) : (
        others.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-md rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md"
          >
            <Avatar displayName={person.name} email={person.id} size={48} />
            <div className="min-w-0">
              <p className="truncate text-title-md text-on-surface">{person.name}</p>
              <p className="truncate text-body-sm text-on-surface-variant">{person.status}</p>
            </div>
          </div>
        ))
      )}

      <ul className="flex flex-col gap-sm text-body-sm text-on-surface">
        <li className="flex items-center gap-sm">
          <CheckCircleIcon size={18} />
          We recommend headphones to avoid echo.
        </li>
        <li className="flex items-center gap-sm">
          <CheckCircleIcon size={18} />
          Today&apos;s situation is generated the moment you join.
        </li>
      </ul>

      <button
        type="button"
        onClick={onJoin}
        className="press-button flex w-full items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-primary-container px-lg py-md text-headline-sm text-on-primary-container outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        Join classroom
        <ArrowRightIcon size={24} />
      </button>

      <Link
        href="/dashboard"
        className="self-center text-label-md text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
      >
        Back to dashboard
      </Link>
    </section>
  );
}

export interface PreCallScreenProps {
  userId: string;
  preview: UseMediaPreview;
  /** Who else is already in, or expected in, the room — read once on arrival. */
  session: ClassroomSession;
  /** Development-only no-device path; see ClassroomScreen. */
  noMedia: boolean;
  onJoin: () => void;
}

/**
 * The pre-call device check: the camera stage and level meter on the left,
 * device selects and the join action on the right — the mockup's 7/5 grid,
 * collapsing to one column below `lg`.
 */
export function PreCallScreen({ userId, preview, session, noMedia, onJoin }: PreCallScreenProps) {
  const voiceDetected = useVoiceDetected(noMedia ? null : preview.level);

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col">
        <p className="mb-xs flex items-center gap-xs text-label-md uppercase tracking-wide text-on-surface-variant">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />
          Live classroom
        </p>
        <h1 className="text-headline-md text-on-surface">Conversation scenario · Practice room</h1>
        <p className="text-body-md text-on-surface-variant">
          Check your camera and microphone before you join.
        </p>
      </div>

      {noMedia ? (
        <p
          role="status"
          className="rounded-md border-2 border-outline-strong bg-badge-warning-bg px-md py-sm text-body-sm text-badge-warning-fg"
        >
          Development mode: continuing without a camera or microphone. You will join without
          publishing audio or video.
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-lg lg:grid-cols-12">
        <div className="flex flex-col gap-md lg:col-span-7">
          <PreviewStage preview={preview} noMedia={noMedia} voiceDetected={voiceDetected} />
          <MicrophoneLevelCard preview={preview} noMedia={noMedia} voiceDetected={voiceDetected} />
        </div>
        <div className="flex flex-col gap-md lg:col-span-5">
          <DevicesCard preview={preview} noMedia={noMedia} />
          <JoinCard session={session} userId={userId} onJoin={onJoin} />
        </div>
      </div>
    </div>
  );
}
