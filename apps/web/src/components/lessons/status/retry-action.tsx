'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, RefreshIcon } from '@/components/ui';
import { ApiRequestError } from '@/lib/api-client';
import { retryPipelineStage, retryRecording } from '@/lib/lessons';

import { LocalizedTime } from '../localized-time';

const UNREACHABLE = 'We could not reach the server. Try again.';

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : UNREACHABLE;
}

/**
 * `Retry` on a failed step (F19, section 2 "Client error handling"). A
 * pipeline stage retries through F08's route; `PIPE001` (already retried,
 * or no longer failed) just refreshes, because the fresh stepper shows the
 * real state; `PIPE002` sends it to F07's recording retry instead. A
 * recording retry's own refusal (`REC001`, `REC002`) is shown inline.
 */
export function RetryAction({
  lessonId,
  route = 'pipeline',
  lastAttemptAt = null,
}: {
  lessonId: string;
  route?: 'pipeline' | 'recording';
  lastAttemptAt?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      if (route === 'recording') {
        await retryRecording(lessonId);
      } else {
        await retryPipelineStage(lessonId);
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'PIPE002') {
        try {
          await retryRecording(lessonId);
        } catch (recordingError) {
          setMessage(messageOf(recordingError));
        }
      } else if (!(error instanceof ApiRequestError && error.code === 'PIPE001')) {
        setMessage(messageOf(error));
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-sm">
        <Button size="sm" variant="neutral" onClick={() => void retry()} loading={busy} loadingLabel="Retrying…">
          <span className="inline-flex items-center gap-xs">
            <RefreshIcon size={16} />
            Retry
          </span>
        </Button>
        {lastAttemptAt ? (
          <span className="text-body-sm text-on-surface-variant">
            Last attempt <LocalizedTime iso={lastAttemptAt} format="time" />
          </span>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="text-body-sm text-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
