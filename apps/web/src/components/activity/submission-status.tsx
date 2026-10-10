import { Button } from '@/components/ui';
import type { RunnerPhase } from './use-objective-runner';

export interface SubmissionStatusProps {
  phase: RunnerPhase;
  onRetry: () => void;
}

/**
 * What the submission is doing (A31): sending, waiting for the connection
 * (automatic retry, plus a manual one), or failed on the server (a human
 * decision). The answers stay on screen in every case.
 */
export function SubmissionStatus({ phase, onRetry }: SubmissionStatusProps) {
  if (phase === 'submitting') {
    return (
      <p role="status" className="text-body-md text-on-surface-variant">
        Saving your answers…
      </p>
    );
  }
  if (phase === 'waiting_for_connection') {
    return (
      <div role="status" className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-badge-warning-bg p-md text-badge-warning-fg">
        <p className="text-body-md">You&apos;re offline. Your answers are saved on this device and will be sent when you reconnect.</p>
        <div>
          <Button type="button" size="sm" variant="neutral" onClick={onRetry}>
            Retry now
          </Button>
        </div>
      </div>
    );
  }
  if (phase === 'save_failed') {
    return (
      <div role="alert" className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-badge-danger-bg p-md text-badge-danger-fg">
        <p className="text-body-md">Your answers could not be saved. Retry?</p>
        <div>
          <Button type="button" size="sm" variant="neutral" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  return null;
}
