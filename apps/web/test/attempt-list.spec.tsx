import type { SpeakingAttemptView } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttemptList } from '@/components/speaking/attempt-list';

afterEach(() => {
  cleanup();
});

function failedAttempt(overrides: Partial<SpeakingAttemptView> = {}): SpeakingAttemptView {
  return {
    id: 'attempt-1',
    clientAttemptId: 'client-1',
    ordinal: null,
    state: 'failed',
    createdAt: '2026-10-02T07:31:12.000Z',
    scoredAt: null,
    durationMs: 5_000,
    isBest: false,
    failure: { code: 'service_error', message: 'Scoring failed. Your recording is saved — re-score when ready.', rescorable: true },
    result: null,
    ...overrides,
  };
}

describe('AttemptList', () => {
  it('renders_nothing_for_an_empty_list', () => {
    render(
      <AttemptList attempts={[]} attemptsRemaining={3} playingAttemptId={null} onTogglePlay={vi.fn()} onRescore={vi.fn()} rescoringId={null} />,
    );

    expect(screen.queryByLabelText('Previous attempts')).not.toBeInTheDocument();
  });

  it('offers_rescore_for_a_rescorable_failure_with_attempts_remaining', async () => {
    const user = userEvent.setup();
    const onRescore = vi.fn();
    render(
      <AttemptList
        attempts={[failedAttempt()]}
        attemptsRemaining={2}
        playingAttemptId={null}
        onTogglePlay={vi.fn()}
        onRescore={onRescore}
        rescoringId={null}
      />,
    );

    expect(screen.getByText(/Not scored — Scoring failed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Re-score' }));
    expect(onRescore).toHaveBeenCalledWith('attempt-1');
  });

  it('hides_rescore_once_every_attempt_has_been_used', () => {
    render(
      <AttemptList
        attempts={[failedAttempt()]}
        attemptsRemaining={0}
        playingAttemptId={null}
        onTogglePlay={vi.fn()}
        onRescore={vi.fn()}
        rescoringId={null}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Re-score' })).not.toBeInTheDocument();
  });

  it('hides_rescore_for_a_non_rescorable_failure', () => {
    render(
      <AttemptList
        attempts={[failedAttempt({ failure: { code: 'audio_rejected', message: 'Azure Speech could not process this recording.', rescorable: false } })]}
        attemptsRemaining={2}
        playingAttemptId={null}
        onTogglePlay={vi.fn()}
        onRescore={vi.fn()}
        rescoringId={null}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Re-score' })).not.toBeInTheDocument();
  });

  it('disables_play_for_an_attempt_still_scoring', () => {
    render(
      <AttemptList
        attempts={[failedAttempt({ state: 'scoring', failure: null })]}
        attemptsRemaining={2}
        playingAttemptId={null}
        onTogglePlay={vi.fn()}
        onRescore={vi.fn()}
        rescoringId={null}
      />,
    );

    expect(screen.getByRole('button', { name: /Play Attempt/ })).toBeDisabled();
    expect(screen.getByText(/Scoring…/)).toBeInTheDocument();
  });
});
