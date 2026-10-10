'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from './button';
import { PauseIcon, PlayIcon } from './icons';

export interface AudioPlayerProps {
  src: string;
  /** Names the player for assistive technology. */
  label?: string;
  /** Fires once, the first time playback starts: the runner creates its attempt here (A4). */
  onFirstPlay?: () => void;
  /** Fires when the media cannot be loaded. */
  onError?: () => void;
  /** `Try again` after an error; the player reloads its source either way. */
  onRetry?: () => void;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * A native `<audio>` element with token-styled controls (A20): Play/Pause
 * (disabled until the metadata has loaded), a seek range and `m:ss / m:ss`.
 * The native range input keeps keyboard and screen-reader seeking for free.
 */
export function AudioPlayer({ src, label = 'Audio', onFirstPlay, onError, onRetry }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const started = useRef(false);
  const seekId = useId();
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    setReady(false);
    setPlaying(false);
    setPosition(0);
    setFailed(false);
  }, [src, generation]);

  function toggle(): void {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      if (!started.current) {
        started.current = true;
        onFirstPlay?.();
      }
      void Promise.resolve(audio.play()).catch(() => undefined);
    } else {
      audio.pause();
    }
  }

  if (failed) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-md rounded-md border-2 border-outline-strong bg-badge-danger-bg p-md text-badge-danger-fg">
        <p className="flex-1 text-body-md">This audio could not be loaded.</p>
        <Button
          type="button"
          variant="neutral"
          size="sm"
          onClick={() => {
            setGeneration((value) => value + 1);
            onRetry?.();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-md rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md">
      {/* Practice audio has no captions on purpose: the transcript is the answer to the exercise and appears after submission. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        key={generation}
        ref={audioRef}
        src={src}
        preload="metadata"
        aria-label={label}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setReady(true);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
      <Button type="button" variant="secondary" size="sm" disabled={!ready} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
        {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
      </Button>
      <input
        id={seekId}
        type="range"
        aria-label="Seek"
        min={0}
        max={duration > 0 ? duration : 0}
        step={0.1}
        value={Math.min(position, duration > 0 ? duration : 0)}
        disabled={!ready}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (audioRef.current) {
            audioRef.current.currentTime = next;
          }
          setPosition(next);
        }}
        className="h-2 flex-1 accent-primary"
      />
      <span className="text-label-md tabular-nums text-on-surface-variant">
        {clock(position)} / {clock(duration)}
      </span>
    </div>
  );
}
