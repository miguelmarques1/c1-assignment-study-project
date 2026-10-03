'use client';

import { useEffect, useState } from 'react';

const SAMPLE_COUNT = 48;

/** The last 48 level samples as bars — a rolling history over a single `level` reading, not a recording's full shape. */
export function RecordingWaveform({ level }: { level: number | null }) {
  const [samples, setSamples] = useState<number[]>(() => Array(SAMPLE_COUNT).fill(0));

  useEffect(() => {
    setSamples((previous) => [...previous.slice(1), Math.max(0, Math.min(100, level ?? 0))]);
  }, [level]);

  return (
    <div aria-hidden="true" className="flex h-12 items-end gap-xs">
      {samples.map((value, index) => (
        <div key={index} className="flex-1 rounded-full bg-secondary" style={{ height: `${Math.max(4, value)}%` }} />
      ))}
    </div>
  );
}
