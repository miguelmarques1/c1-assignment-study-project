'use client';

import {
  createLocalTracks,
  MediaDeviceFailure,
  Room,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type PreviewDeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';

export interface PreviewDevices {
  audioinput: MediaDeviceInfo[];
  videoinput: MediaDeviceInfo[];
  audiooutput: MediaDeviceInfo[];
}

const EMPTY_DEVICES: PreviewDevices = { audioinput: [], videoinput: [], audiooutput: [] };

/** Denying the camera and denying the microphone lead to different outcomes — kept separate on purpose. */
export interface MediaPreviewState {
  status: 'requesting' | 'ready' | 'error';
  audioTrack: LocalAudioTrack | null;
  videoTrack: LocalVideoTrack | null;
  /** `true` when the microphone itself was denied — this blocks connecting entirely. */
  microphoneDenied: boolean;
  /** `true` when only the camera was denied — the lesson still starts, audio-only. */
  cameraDenied: boolean;
  devices: PreviewDevices;
  selectedDeviceId: Partial<Record<PreviewDeviceKind, string>>;
  /** 0-100, or null while there is no audio track to measure. */
  level: number | null;
}

function classifyDenial(error: unknown): 'denied' | 'not-found' | 'other' {
  const failure = MediaDeviceFailure.getFailure(error);
  if (failure === MediaDeviceFailure.PermissionDenied) return 'denied';
  if (failure === MediaDeviceFailure.NotFound) return 'not-found';
  return 'other';
}

/** An AnalyserNode over the live microphone track, sampled on every animation frame. */
function useLevelMeter(track: LocalAudioTrack | null): number | null {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    if (!track) {
      setLevel(null);
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame: number;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setLevel(Math.min(100, Math.round((average / 255) * 200)));
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => undefined);
    };
  }, [track]);

  return level;
}

export interface UseMediaPreview extends MediaPreviewState {
  selectDevice: (kind: PreviewDeviceKind, deviceId: string) => Promise<void>;
  retry: () => void;
  /** Stops both tracks — called once the caller moves on from the preview. */
  release: () => void;
}

/** Local track creation, device enumeration/switching and the level meter for the pre-join screen. */
export function useMediaPreview(): UseMediaPreview {
  const [state, setState] = useState<MediaPreviewState>({
    status: 'requesting',
    audioTrack: null,
    videoTrack: null,
    microphoneDenied: false,
    cameraDenied: false,
    devices: EMPTY_DEVICES,
    selectedDeviceId: {},
    level: null,
  });
  const attempt = useRef(0);

  const acquire = useCallback(async () => {
    const thisAttempt = ++attempt.current;
    setState((prev) => ({ ...prev, status: 'requesting' }));

    let audioTrack: LocalAudioTrack | null = null;
    let videoTrack: LocalVideoTrack | null = null;
    let microphoneDenied = false;
    let cameraDenied = false;

    try {
      const tracks = (await createLocalTracks({ audio: true, video: false })) as LocalAudioTrack[];
      audioTrack = tracks[0] ?? null;
    } catch (error) {
      microphoneDenied = classifyDenial(error) !== 'other' ? true : microphoneDenied;
    }

    try {
      const tracks = (await createLocalTracks({ audio: false, video: true })) as LocalVideoTrack[];
      videoTrack = tracks[0] ?? null;
    } catch {
      cameraDenied = true;
    }

    if (thisAttempt !== attempt.current) {
      // A newer retry superseded this one; stop what we just acquired.
      audioTrack?.stop();
      videoTrack?.stop();
      return;
    }

    const devices: PreviewDevices = {
      audioinput: await Room.getLocalDevices('audioinput').catch(() => []),
      videoinput: await Room.getLocalDevices('videoinput').catch(() => []),
      audiooutput: await Room.getLocalDevices('audiooutput').catch(() => []),
    };

    setState({
      status: 'ready',
      audioTrack,
      videoTrack,
      microphoneDenied,
      cameraDenied,
      devices,
      selectedDeviceId: {
        audioinput: audioTrack?.mediaStreamTrack.getSettings().deviceId,
        videoinput: videoTrack?.mediaStreamTrack.getSettings().deviceId,
      },
      level: null,
    });
  }, []);

  useEffect(() => {
    void acquire();
    return () => {
      attempt.current += 1;
    };
  }, [acquire]);

  const selectDevice = useCallback(async (kind: PreviewDeviceKind, deviceId: string) => {
    setState((prev) => ({ ...prev, selectedDeviceId: { ...prev.selectedDeviceId, [kind]: deviceId } }));

    if (kind === 'audiooutput') {
      // No local element plays the microphone back to itself — nothing to switch yet.
      return;
    }

    setState((prev) => {
      if (kind === 'audioinput') {
        prev.audioTrack?.stop();
      } else {
        prev.videoTrack?.stop();
      }
      return prev;
    });

    try {
      if (kind === 'audioinput') {
        const tracks = (await createLocalTracks({
          audio: { deviceId },
          video: false,
        })) as LocalAudioTrack[];
        setState((prev) => ({ ...prev, audioTrack: tracks[0] ?? null }));
      } else {
        const tracks = (await createLocalTracks({
          audio: false,
          video: { deviceId },
        })) as LocalVideoTrack[];
        setState((prev) => ({ ...prev, videoTrack: tracks[0] ?? null }));
      }
    } catch {
      // The previously-working device stays selected in the UI; switching
      // failed silently rather than tearing down an otherwise-working preview.
    }
  }, []);

  const release = useCallback(() => {
    setState((prev) => {
      prev.audioTrack?.stop();
      prev.videoTrack?.stop();
      return prev;
    });
  }, []);

  const level = useLevelMeter(state.audioTrack);

  return { ...state, level, selectDevice, retry: () => void acquire(), release };
}
