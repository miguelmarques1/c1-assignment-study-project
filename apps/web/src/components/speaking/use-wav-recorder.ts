'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAudioLevel } from '@/components/classroom/use-audio-level';
import { encodeWav, resampleTo16kMono } from '@/lib/wav-encoder';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';
export type RecorderErrorReason = 'denied' | 'not-found' | 'unsupported' | 'other';

export interface UseWavRecorder {
  status: RecorderStatus;
  errorReason: RecorderErrorReason | null;
  /** Milliseconds since `start()`, ticking while `status` is `'recording'`. */
  elapsedMs: number;
  /** 0-100, or null while there is no live track to measure (A9's `RecordingWaveform` keeps its own rolling history). */
  level: number | null;
  /** Set once encoding finishes after `stop()`. */
  wav: Uint8Array<ArrayBuffer> | null;
  /** True when the recording stopped itself at `maxRecordingSeconds` rather than by a manual `stop()`. */
  hitLimit: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

function classifyGetUserMediaError(error: unknown): RecorderErrorReason {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'not-found';
  }
  return 'other';
}

/**
 * Records the microphone through `MediaRecorder`, then on stop decodes the
 * captured clip and re-encodes it as 16 kHz mono WAV (A22) — Azure's
 * pronunciation assessment and fast transcription both require that format,
 * and no browser's `MediaRecorder` emits it directly.
 */
export function useWavRecorder(maxRecordingSeconds: number): UseWavRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [errorReason, setErrorReason] = useState<RecorderErrorReason | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [wav, setWav] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [hitLimit, setHitLimit] = useState(false);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const level = useAudioLevel(track);

  const clearTimers = useCallback(() => {
    if (tickTimerRef.current !== undefined) clearInterval(tickTimerRef.current);
    if (limitTimerRef.current !== undefined) clearTimeout(limitTimerRef.current);
    tickTimerRef.current = undefined;
    limitTimerRef.current = undefined;
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    streamRef.current = null;
    setTrack(null);
  }, []);

  const finish = useCallback(async () => {
    clearTimers();
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType ?? 'audio/webm' });
    chunksRef.current = [];
    releaseStream();

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close().catch(() => undefined);
      const samples = await resampleTo16kMono(decoded);
      setWav(encodeWav(samples, 16_000));
      setStatus('stopped');
    } catch {
      setErrorReason('other');
      setStatus('error');
    }
  }, [clearTimers, releaseStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setStatus('requesting');
    setErrorReason(null);
    setWav(null);
    setHitLimit(false);
    setElapsedMs(0);

    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorReason('unsupported');
      setStatus('error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setErrorReason(classifyGetUserMediaError(error));
      setStatus('error');
      return;
    }

    streamRef.current = stream;
    setTrack(stream.getAudioTracks()[0] ?? null);
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      void finish();
    };
    recorder.start();
    startedAtRef.current = Date.now();
    setStatus('recording');

    tickTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
    limitTimerRef.current = setTimeout(() => {
      setHitLimit(true);
      stop();
    }, maxRecordingSeconds * 1000);
  }, [finish, maxRecordingSeconds, stop]);

  const reset = useCallback(() => {
    clearTimers();
    releaseStream();
    chunksRef.current = [];
    setStatus('idle');
    setErrorReason(null);
    setElapsedMs(0);
    setWav(null);
    setHitLimit(false);
  }, [clearTimers, releaseStream]);

  useEffect(
    () => () => {
      clearTimers();
      releaseStream();
    },
    [clearTimers, releaseStream],
  );

  return { status, errorReason, elapsedMs, level, wav, hitLimit, start, stop, reset };
}
