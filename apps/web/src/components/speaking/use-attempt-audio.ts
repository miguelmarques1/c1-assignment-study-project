'use client';

import { useCallback, useRef, useState } from 'react';

import { fetchAttemptAudio } from '@/lib/speaking';

/** Padding either side of a single word's segment (A27) — a word's own span is too tight to hear cleanly on its own. */
const RANGE_PADDING_MS = 100;

export interface UseAttemptAudio {
  /** The attempt currently playing through `play`/`playRange`, or null for a local recording or nothing playing. */
  playingAttemptId: string | null;
  isPlaying: boolean;
  /** Plays a stored attempt's recording in full. */
  play: (attemptId: string) => Promise<void>;
  /** Plays a not-yet-uploaded recording directly from its `Blob`. */
  playLocal: (wav: Blob) => Promise<void>;
  /** Plays one word's segment of a stored attempt, padded (A27). */
  playRange: (attemptId: string, startMs: number, durationMs: number) => Promise<void>;
  stop: () => void;
}

/** Fetches, decodes and plays attempt audio, caching each attempt's decoded buffer so replays and ranges skip the network. */
export function useAttemptAudio(): UseAttemptAudio {
  const [playingAttemptId, setPlayingAttemptId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const context = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const stop = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      // Already stopped or never started — nothing to undo.
    }
    sourceRef.current = null;
    setIsPlaying(false);
    setPlayingAttemptId(null);
  }, []);

  const bufferFor = useCallback(
    async (attemptId: string): Promise<AudioBuffer> => {
      const cached = buffersRef.current.get(attemptId);
      if (cached) {
        return cached;
      }
      const arrayBuffer = await fetchAttemptAudio(attemptId);
      const buffer = await context().decodeAudioData(arrayBuffer);
      buffersRef.current.set(attemptId, buffer);
      return buffer;
    },
    [context],
  );

  const playBuffer = useCallback(
    (buffer: AudioBuffer, attemptId: string | null, offsetSec: number, durationSec?: number) => {
      sourceRef.current?.stop();
      const ctx = context();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
          setIsPlaying(false);
          setPlayingAttemptId(null);
        }
      };
      sourceRef.current = source;
      setIsPlaying(true);
      setPlayingAttemptId(attemptId);
      if (durationSec === undefined) {
        source.start(0, offsetSec);
      } else {
        source.start(0, offsetSec, durationSec);
      }
    },
    [context],
  );

  const play = useCallback(
    async (attemptId: string) => {
      const buffer = await bufferFor(attemptId);
      playBuffer(buffer, attemptId, 0);
    },
    [bufferFor, playBuffer],
  );

  const playLocal = useCallback(
    async (wav: Blob) => {
      const arrayBuffer = await wav.arrayBuffer();
      const buffer = await context().decodeAudioData(arrayBuffer);
      playBuffer(buffer, null, 0);
    },
    [context, playBuffer],
  );

  const playRange = useCallback(
    async (attemptId: string, startMs: number, durationMs: number) => {
      const buffer = await bufferFor(attemptId);
      const totalMs = buffer.duration * 1000;
      const paddedStartMs = Math.max(0, startMs - RANGE_PADDING_MS);
      const paddedEndMs = Math.min(totalMs, startMs + durationMs + RANGE_PADDING_MS);
      playBuffer(buffer, attemptId, paddedStartMs / 1000, (paddedEndMs - paddedStartMs) / 1000);
    },
    [bufferFor, playBuffer],
  );

  return { playingAttemptId, isPlaying, play, playLocal, playRange, stop };
}
