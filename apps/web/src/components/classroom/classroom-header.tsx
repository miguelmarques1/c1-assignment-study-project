'use client';

import { useEffect, useState } from 'react';

import { cn, TimerIcon } from '@/components/ui';

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) {
    return '00:00';
  }
  const totalSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export interface ElapsedTimerProps {
  startedAt: string | null;
  /** The live lesson's pill carries a pulsing dot; the waiting room's a stopwatch. */
  live?: boolean;
}

/** Elapsed lesson time — `00:00` until `lessons.started_at` is set. */
export function ElapsedTimer({ startedAt, live = false }: ElapsedTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs border-2 border-outline-strong px-md py-xs text-label-lg text-on-surface',
        live && 'rounded-full bg-surface-container-lowest shadow-button',
        !live && 'rounded-md bg-surface-container',
      )}
    >
      {live ? (
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-tertiary motion-safe:animate-pulse" />
      ) : (
        <TimerIcon size={18} />
      )}
      <span aria-label="Elapsed time" className="tabular-nums">
        {formatElapsed(startedAt, now)}
      </span>
    </span>
  );
}
