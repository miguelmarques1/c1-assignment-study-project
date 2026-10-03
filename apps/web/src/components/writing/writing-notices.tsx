'use client';

import type { WritingLimitView } from '@english-quest/shared';
import Link from 'next/link';

import { Button } from '@/components/ui';

/** Missing or invalid Gemini key: submission is prevented, and the draft is untouched. */
export function MissingKeyNotice() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-sm rounded-md border-2 border-outline-strong bg-surface-container p-md">
      <p className="text-body-md text-on-surface">Add your Gemini key to have your writing corrected.</p>
      <Link href="/settings" className="text-label-md text-primary underline">
        Go to settings
      </Link>
    </div>
  );
}

/** `Resets at {time}`, or `Resets tomorrow at {time}` when the reset falls on the caller's next local day. */
function formatResetLine(resetsAt: string, now: Date): string {
  const reset = new Date(resetsAt);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(reset);
  return reset.toDateString() === now.toDateString() ? `Resets at ${time}` : `Resets tomorrow at ${time}`;
}

export interface LimitNoticeProps {
  limit: WritingLimitView;
  now: Date;
}

export function LimitNotice({ limit, now }: LimitNoticeProps) {
  if (!limit.resetsAt) {
    return null;
  }
  return (
    <div className="flex flex-col gap-xs rounded-md border-2 border-outline-strong bg-surface-container p-md">
      <p className="text-body-md text-on-surface">You have reached today&rsquo;s limit of {limit.max} corrections.</p>
      <p className="text-body-sm text-on-surface-variant">{formatResetLine(limit.resetsAt, now)}</p>
    </div>
  );
}

export interface FailureNoticeProps {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

/** The server's own failure message, with a retry action (spec §4 failure modes). */
export function FailureNotice({ message, onRetry, retrying }: FailureNoticeProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-sm rounded-md border-2 border-outline-strong bg-badge-danger-bg p-md"
    >
      <p className="text-body-md text-badge-danger-fg">{message}</p>
      <Button variant="neutral" size="sm" onClick={onRetry} loading={retrying} loadingLabel="Retrying…">
        Retry correction
      </Button>
    </div>
  );
}
