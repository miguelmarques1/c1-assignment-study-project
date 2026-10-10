'use client';

import { AudioPlayer } from '@/components/ui';
import { activityMediaUrl } from '@/lib/activities';

export interface ListeningPaneProps {
  activityId: string;
  /** The first play creates the attempt (A4); a failed load never does. */
  onFirstPlay: () => void;
  onError: () => void;
  onRetry: () => void;
}

/** The player pinned above the questions. The transcript stays hidden until the answers are submitted. */
export function ListeningPane({ activityId, onFirstPlay, onError, onRetry }: ListeningPaneProps) {
  return (
    <section className="flex flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card">
      <h2 className="text-label-lg text-on-surface-variant">Listen</h2>
      <AudioPlayer src={activityMediaUrl(activityId)} label="Activity audio" onFirstPlay={onFirstPlay} onError={onError} onRetry={onRetry} />
      <p className="text-body-sm text-on-surface-variant">The transcript appears after you submit.</p>
    </section>
  );
}
