'use client';

import { useState } from 'react';

import { CloseIcon } from '@/components/ui';

/**
 * Surfaced immediately when the lesson's recording has failed — a lesson
 * discovered to be unrecorded an hour later is a lesson lost. Dismissible for
 * the rest of the session: once acknowledged, the banner does not need to
 * keep repeating a fact the indicator badge already states continuously.
 */
export function NotRecordingBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-md rounded-md border-2 border-outline-strong bg-badge-warning-bg px-md py-sm text-body-sm text-badge-warning-fg"
    >
      <p>This lesson is not being recorded. End and restart to try again.</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="press-button flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-outline-strong bg-surface-container-lowest outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
