'use client';

import { useEffect, useState } from 'react';

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

export interface ClassroomHeaderProps {
  startedAt: string | null;
}

/** Elapsed time and the slot F07 fills with the recording indicator — F05 renders neither yet. */
export function ClassroomHeader({ startedAt }: ClassroomHeaderProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="flex items-center justify-between gap-md border-b-2 border-outline-strong px-md py-sm">
      <span aria-label="Elapsed time" className="text-label-lg tabular-nums text-on-surface">
        {formatElapsed(startedAt, now)}
      </span>
      {/* F07's recording indicator mounts here once egress lands; F05 leaves it empty. */}
      <div data-slot="recording-indicator" />
    </header>
  );
}
