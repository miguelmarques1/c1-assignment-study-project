'use client';

import { formatClock } from '@/components/lessons/format';
import { Button, MicrophoneIcon, StopIcon } from '@/components/ui';

import { RecordingWaveform } from './recording-waveform';

interface RecorderPanelProps {
  recording: boolean;
  /** False once every attempt has been scored — the counter still shows, but there is nothing left to record. */
  canRecord: boolean;
  elapsedMs: number;
  maxRecordingSeconds: number;
  level: number | null;
  hitLimit: boolean;
  attemptsUsed: number;
  attemptsRemaining: number;
  maxAttempts: number;
  onStart: () => void;
  onStop: () => void;
}

function attemptCounterText(attemptsUsed: number, attemptsRemaining: number, maxAttempts: number): string {
  if (attemptsRemaining <= 0) {
    return `All ${maxAttempts} attempts used. Your best score counts.`;
  }
  return `Attempt ${attemptsUsed + 1} of ${maxAttempts}`;
}

/** The record button, waveform, elapsed timer and attempt counter — the recording half of the runner. */
export function RecorderPanel({
  recording,
  canRecord,
  elapsedMs,
  maxRecordingSeconds,
  level,
  hitLimit,
  attemptsUsed,
  attemptsRemaining,
  maxAttempts,
  onStart,
  onStop,
}: RecorderPanelProps) {
  return (
    <div className="flex flex-col items-center gap-md">
      {canRecord ? (
        <>
          <RecordingWaveform level={recording ? level : null} />
          <p className="text-title-lg text-on-surface" aria-hidden="true">
            {formatClock(elapsedMs)} / {formatClock(maxRecordingSeconds * 1000)}
          </p>
          <Button
            type="button"
            variant={recording ? 'destructive' : 'primary'}
            size="lg"
            fullWidth
            onClick={recording ? onStop : onStart}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            <span className="inline-flex items-center gap-sm">
              {recording ? <StopIcon size={20} /> : <MicrophoneIcon size={20} />}
              {recording ? 'Stop' : 'Record'}
            </span>
          </Button>
          <p role="status" aria-live="polite" className="sr-only">
            {hitLimit ? `Recording stopped at the ${Math.round(maxRecordingSeconds / 60)}-minute limit.` : recording ? 'Recording…' : ''}
          </p>
        </>
      ) : null}
      <p className="text-label-md text-on-surface-variant">{attemptCounterText(attemptsUsed, attemptsRemaining, maxAttempts)}</p>
    </div>
  );
}
