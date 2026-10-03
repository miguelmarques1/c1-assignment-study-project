'use client';

import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/lib/relative-time';
import type { WritingSaveState } from './use-writing-draft';

export interface SaveIndicatorProps {
  saveState: WritingSaveState;
  savedAt: string | null;
}

/** Lower-cases the leading word of a relative label mid-sentence ("Just now" → "just now"). */
function lowerFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * A subtle confirmation of autosave (spec §4): `Saved {relative}`, refreshed
 * every 15 seconds so the relative label stays current, `Saving…`, or
 * `Saved on this device · not synced` when the server copy could not be
 * reached. Says nothing while a conflict is shown — the banner owns that.
 */
export function SaveIndicator({ saveState, savedAt }: SaveIndicatorProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => forceTick((value) => value + 1), 15_000);
    return () => clearInterval(timer);
  }, []);

  if (saveState === 'conflict') {
    return null;
  }
  if (saveState === 'saving') {
    return <span className="text-label-md text-on-surface-variant">Saving…</span>;
  }
  if (saveState === 'local_only') {
    return <span className="text-label-md text-on-surface-variant">Saved on this device · not synced</span>;
  }
  if (!savedAt) {
    return null;
  }
  return <span className="text-label-md text-on-surface-variant">Saved {lowerFirst(formatRelativeTime(savedAt))}</span>;
}
