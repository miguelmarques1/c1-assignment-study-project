'use client';

import type { LiveRecording } from '@english-quest/shared';
import { useState } from 'react';

import { Button, ChartIcon, CloseIcon, CloudCheckIcon, HangUpIcon, WarningIcon } from '@/components/ui';

export interface EndLessonDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  /** F07: the mockup's "24m 18s audio recorded safely" line, from the caller's own captured audio. */
  recording: LiveRecording;
}

function formatCaptured(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Names the consequence, confirms or cancels, disables while the request is
 * in flight. The wording is the PRD's, split across the heading and the
 * information box the mockup lays it out in.
 */
export function EndLessonDialog({ open, onCancel, onConfirm, recording }: EndLessonDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-outline-strong/60 p-md backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="end-lesson-dialog-title"
        aria-describedby="end-lesson-dialog-description"
        className="relative flex w-full max-w-136 flex-col items-center rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg text-center shadow-modal sm:p-xl"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close dialog"
          className="press-button absolute top-md right-md flex h-9 w-9 items-center justify-center rounded-md border-2 border-outline-strong bg-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          <CloseIcon size={20} />
        </button>

        <div className="relative mb-md">
          <span className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-outline-strong bg-badge-danger-bg shadow-button">
            <HangUpIcon size={32} />
          </span>
          <span className="absolute -right-sm -bottom-xs rounded-sm border-2 border-outline-strong bg-surface-container-lowest px-xs">
            <WarningIcon size={14} />
          </span>
        </div>

        <span className="mb-sm inline-flex items-center gap-xs rounded-full border border-outline-strong bg-badge-danger-bg px-sm py-xs text-label-sm uppercase tracking-wider text-badge-danger-fg">
          <WarningIcon size={14} />
          Final call
        </span>

        <h2 id="end-lesson-dialog-title" className="mb-md text-headline-md text-on-surface">
          End the lesson for everyone?
        </h2>

        <div className="mb-lg flex w-full items-start gap-sm rounded-md border-2 border-outline-strong bg-surface p-md text-left shadow-button">
          <ChartIcon size={20} className="mt-xs shrink-0" />
          <div className="flex flex-col gap-xs">
            <p id="end-lesson-dialog-description" className="text-body-md text-on-surface">
              Processing will start and results will be ready in about 30 minutes.
            </p>
            <p className="text-body-sm text-on-surface-variant">
              Everyone in the room is disconnected when the lesson ends.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col-reverse items-center justify-end gap-md sm:flex-row">
          <Button variant="neutral" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} loading={submitting} loadingLabel="Ending…">
            <span className="inline-flex items-center gap-xs">
              <HangUpIcon size={18} />
              End lesson
            </span>
          </Button>
        </div>

        {recording.status === 'idle' ? null : (
          <p className="mt-md w-full border-t-2 border-outline-strong pt-sm text-body-sm text-on-surface-variant">
            {recording.status === 'not_recording' ? (
              'This lesson is not being recorded.'
            ) : (
              <span className="inline-flex items-center gap-xs">
                <CloudCheckIcon size={14} className="text-tertiary" />
                {formatCaptured(recording.mine.capturedSeconds)} audio recorded safely
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
