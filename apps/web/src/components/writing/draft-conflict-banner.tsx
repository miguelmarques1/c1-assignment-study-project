'use client';

import { useState } from 'react';

import { Button, Dialog } from '@/components/ui';

export interface DraftConflictBannerProps {
  /** `conflict`: a save was rejected as stale. `submitted_elsewhere`: another device already submitted this task. */
  variant: 'conflict' | 'submitted_elsewhere';
  localText: string;
  onContinue: () => void;
}

/**
 * A conflict is surfaced, never resolved silently (A5, A6): `View your
 * version` opens a read-only copy of the local text with a `Copy` action,
 * and the primary action adopts the server's copy.
 */
export function DraftConflictBanner({ variant, localText, onContinue }: DraftConflictBannerProps) {
  const [viewing, setViewing] = useState(false);
  const message =
    variant === 'conflict'
      ? 'This draft was updated on another device.'
      : 'This draft was submitted from another device.';
  const continueLabel = variant === 'conflict' ? 'Continue with the latest version' : 'Dismiss';

  async function copyLocalVersion(): Promise<void> {
    try {
      await navigator.clipboard.writeText(localText);
    } catch {
      // Clipboard access can be denied; the text stays visible in the dialog to copy by hand.
    }
  }

  return (
    <div role="alert" className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-surface-container p-md">
      <p className="text-body-md text-on-surface">{message}</p>
      <div className="flex flex-wrap gap-sm">
        <Button variant="neutral" size="sm" onClick={() => setViewing(true)}>
          View your version
        </Button>
        <Button variant="primary" size="sm" onClick={onContinue}>
          {continueLabel}
        </Button>
      </div>
      <Dialog
        open={viewing}
        onClose={() => setViewing(false)}
        title="Your version"
        footer={
          <Button variant="neutral" onClick={copyLocalVersion}>
            Copy
          </Button>
        }
      >
        <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-body-md text-on-surface">{localText}</p>
      </Dialog>
    </div>
  );
}
