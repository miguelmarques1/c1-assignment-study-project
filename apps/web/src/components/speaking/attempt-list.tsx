'use client';

import type { SpeakingAttemptView } from '@english-quest/shared';

import { Button, PlayIcon, StopIcon } from '@/components/ui';

interface AttemptListProps {
  attempts: SpeakingAttemptView[];
  attemptsRemaining: number;
  playingAttemptId: string | null;
  onTogglePlay: (attemptId: string) => void;
  onRescore: (attemptId: string) => void;
  rescoringId: string | null;
}

function attemptText(attempt: SpeakingAttemptView, ordinalLabel: string): string {
  if (attempt.state === 'scored' && attempt.result) {
    const score = Math.round(attempt.result.scores.pronunciation);
    return attempt.isBest ? `${ordinalLabel} · ${score} · Best` : `${ordinalLabel} · ${score}`;
  }
  if (attempt.state === 'scoring') {
    return `${ordinalLabel} · Scoring…`;
  }
  return `${ordinalLabel} · Not scored — ${attempt.failure?.message ?? 'Unknown error'}`;
}

/** Every attempt so far, oldest first: its score or failure, a play of the whole recording, and re-score when it qualifies. */
export function AttemptList({ attempts, attemptsRemaining, playingAttemptId, onTogglePlay, onRescore, rescoringId }: AttemptListProps) {
  if (attempts.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Previous attempts" className="flex flex-col gap-sm">
      {attempts.map((attempt, index) => {
        const ordinalLabel = `Attempt ${attempt.ordinal ?? index + 1}`;
        const canPlay = attempt.state === 'scored' || attempt.state === 'failed';
        const isPlaying = playingAttemptId === attempt.id;
        return (
          <li key={attempt.id} className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-sm">
              <button
                type="button"
                aria-label={`${isPlaying ? 'Stop' : 'Play'} ${ordinalLabel}`}
                onClick={() => onTogglePlay(attempt.id)}
                disabled={!canPlay}
                className="text-on-surface-variant disabled:opacity-40"
              >
                {isPlaying ? <StopIcon size={16} /> : <PlayIcon size={16} />}
              </button>
              <span className="text-body-md text-on-surface">{attemptText(attempt, ordinalLabel)}</span>
            </div>
            {attempt.state === 'failed' && attempt.failure?.rescorable && attemptsRemaining > 0 ? (
              <Button size="sm" variant="neutral" loading={rescoringId === attempt.id} loadingLabel="Re-scoring…" onClick={() => onRescore(attempt.id)}>
                Re-score
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
