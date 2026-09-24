import type { LiveRecordingStatus } from '@english-quest/shared';

import { cn } from '@/components/ui';

/**
 * Mirrors `Badge`'s own classes rather than composing `Badge` itself —
 * `Badge.children` is typed as plain text, and this indicator needs a
 * pulsing dot alongside the label. Same precedent as F05's
 * `EndLessonDialog`/`ReconnectingOverlay`: local markup built from the
 * primitive's own token classes rather than widening the primitive's type
 * for one call site.
 */
const STATUS_CLASSES: Record<'recording' | 'not_recording' | 'starting', string> = {
  recording: 'bg-badge-danger-bg text-badge-danger-fg',
  not_recording: 'bg-badge-warning-bg text-badge-warning-fg',
  starting: 'bg-badge-neutral-bg text-badge-neutral-fg',
};

const LABELS: Record<'recording' | 'not_recording' | 'starting', string> = {
  recording: 'Recording',
  not_recording: 'Not recording',
  starting: 'Starting recording…',
};

export interface RecordingIndicatorProps {
  status: LiveRecordingStatus;
}

/**
 * The classroom header's recording indicator (F07). `idle` renders nothing —
 * there is nothing to announce before the lesson itself starts recording.
 */
export function RecordingIndicator({ status }: RecordingIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs rounded-full border-2 border-outline-strong px-sm py-xs text-label-sm uppercase tracking-wide',
        STATUS_CLASSES[status],
      )}
    >
      {status === 'recording' ? (
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-badge-danger-fg motion-safe:animate-pulse" />
      ) : null}
      {LABELS[status]}
    </span>
  );
}
