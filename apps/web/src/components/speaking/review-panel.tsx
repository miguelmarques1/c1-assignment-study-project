'use client';

import Link from 'next/link';

import { Button, PlayIcon, StopIcon } from '@/components/ui';

export type UploadFailureKind = 'network' | 'credential';

interface ReviewPanelProps {
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onSubmit: () => void;
  submitting: boolean;
  /** Set once an upload has failed — `credential` shows the A12 sentence with a settings link, `network` the generic retry sentence. */
  uploadFailure: UploadFailureKind | null;
  /** Re-sends the same client id (A21) so a retried upload after a lost response returns the one stored attempt. */
  onRetry: () => void;
}

/** Before submitting: play the pending recording, discard it, or submit it — and the upload-failure retry. */
export function ReviewPanel({ isPlaying, onPlay, onStop, onDiscard, onSubmit, submitting, uploadFailure, onRetry }: ReviewPanelProps) {
  if (uploadFailure === 'credential') {
    return (
      <div className="flex flex-col items-center gap-sm text-center">
        <p role="alert" className="text-body-md text-error">
          Add your Azure Speech key to use speaking activities.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-sm">
          <Link
            href="/settings"
            className="press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-label-lg font-semibold text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
          >
            Open settings
          </Link>
          <Button variant="neutral" onClick={onDiscard} disabled={submitting}>
            Discard
          </Button>
          <Button variant="primary" loading={submitting} loadingLabel="Retrying…" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (uploadFailure === 'network') {
    return (
      <div className="flex flex-col items-center gap-sm text-center">
        <p role="alert" className="text-body-md text-error">
          Your recording could not be uploaded. Retry?
        </p>
        <div className="flex gap-sm">
          <Button variant="neutral" onClick={onDiscard} disabled={submitting}>
            Discard
          </Button>
          <Button variant="primary" loading={submitting} loadingLabel="Retrying…" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-md">
      <Button type="button" variant="neutral" onClick={isPlaying ? onStop : onPlay} aria-label={isPlaying ? 'Pause recording' : 'Play recording'}>
        <span className="inline-flex items-center gap-sm">
          {isPlaying ? <StopIcon size={20} /> : <PlayIcon size={20} />}
          {isPlaying ? 'Pause' : 'Play recording'}
        </span>
      </Button>
      <div className="flex gap-sm">
        <Button variant="neutral" onClick={onDiscard} disabled={submitting}>
          Discard
        </Button>
        <Button variant="primary" loading={submitting} loadingLabel="Scoring your pronunciation…" onClick={onSubmit}>
          Submit
        </Button>
      </div>
    </div>
  );
}
