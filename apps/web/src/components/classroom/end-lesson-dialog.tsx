'use client';

import { useState } from 'react';

import { Button, Stack } from '@/components/ui';

export interface EndLessonDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/** Names the consequence, confirms or cancels, disables while the request is in flight. */
export function EndLessonDialog({ open, onCancel, onConfirm }: EndLessonDialogProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-outline-strong p-md">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="end-lesson-dialog-title"
        className="w-full max-w-96 rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-modal"
      >
        <Stack gap="md">
          <p id="end-lesson-dialog-title" className="text-title-md text-on-surface">
            End the lesson for everyone? Processing will start and results will be ready in about
            30 minutes.
          </p>
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="neutral" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              loading={submitting}
              loadingLabel="Ending…"
            >
              End lesson
            </Button>
          </Stack>
        </Stack>
      </div>
    </div>
  );
}
