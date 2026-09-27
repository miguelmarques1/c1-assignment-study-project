import type { ErrorCode } from '@english-quest/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusArea } from '@/components/lessons/status/status-area';
import { ApiRequestError } from '@/lib/api-client';

import {
  detail,
  LESSON_ID,
  ok,
  pipelineStage,
  pipelineView,
  recordingView,
} from './fixtures/lessons';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => `/lessons/${LESSON_ID}/status`,
}));

const apiFetch = vi.fn();
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function apiError(status: number, code: ErrorCode, message = 'Refused.') {
  return new ApiRequestError(status, { error: { code, message, details: null } });
}

beforeEach(() => {
  refresh.mockReset();
  apiFetch.mockReset();
});

afterEach(() => {
  cleanup();
});

function ownSteps() {
  return within(screen.getByRole('list', { name: 'Your processing' })).getAllByRole('listitem');
}

describe('status area', () => {
  it('status_tab_shows_every_stage_per_participant', () => {
    render(<StatusArea lesson={detail()} pipeline={ok(pipelineView())} recording={ok(recordingView())} />);

    const steps = ownSteps();
    expect(steps.map((step) => step.querySelector('.text-title-md')?.textContent)).toEqual([
      'Scenario',
      'Recorded',
      'Transcribed',
      'Excerpts selected',
      'Pronunciation assessed',
      'Analyzed',
      'Profile updated',
      'Plan generated',
    ]);
    expect(steps[0]).toHaveTextContent('Ready');
    expect(steps[2]).toHaveTextContent('DoneTook 1m 04s');
    expect(steps[5]).toHaveTextContent('Failed');
    expect(steps[6]).toHaveTextContent('Not started');
    expect(steps[7]).toHaveTextContent('Not started');

    const others = within(screen.getByRole('list', { name: "Ana's processing" })).getAllByRole('listitem');
    expect(others).toHaveLength(7);
    expect(others[1]).toHaveTextContent('TranscribedDone');
    expect(others[3]).toHaveTextContent('In progress');
    expect(others[4]).toHaveTextContent('Not started');
  });

  it('a_blocked_stage_links_to_settings', () => {
    render(
      <StatusArea
        lesson={detail({ status: 'blocked' })}
        pipeline={ok(
          pipelineView([
            pipelineStage({ stage: 'recording', status: 'completed', finishedAt: '2026-09-24T15:03:30.000Z' }),
            pipelineStage({
              stage: 'transcription',
              status: 'blocked_missing_key',
              reasonCode: 'credential_missing',
              reason: 'Blocked — add your Azure Speech key to continue.',
              blockedProvider: 'azure_speech',
            }),
          ]),
        )}
        recording={ok(recordingView())}
      />,
    );
    const blocked = ownSteps()[2]!;
    expect(blocked).toHaveTextContent('Blocked — add your Azure Speech key to continue.');
    expect(within(blocked).getByRole('link', { name: 'Open settings' })).toHaveAttribute('href', '/settings');
    expect(within(blocked).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a_failed_stage_offers_retry_with_its_last_attempt', () => {
    render(<StatusArea lesson={detail()} pipeline={ok(pipelineView())} recording={ok(recordingView())} />);
    const failed = ownSteps()[5]!;
    expect(failed).toHaveTextContent('The analysis came back malformed twice.');
    expect(failed).toHaveTextContent('Details: Schema validation failed at /errors/3');
    expect(failed).toHaveTextContent(/Last attempt \d{2}:\d{2}/);
    expect(within(failed).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retry_calls_the_pipeline_retry_route', async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValueOnce(pipelineView());
    render(<StatusArea lesson={detail()} pipeline={ok(pipelineView())} recording={ok(recordingView())} />);

    await user.click(within(ownSteps()[5]!).getByRole('button', { name: 'Retry' }));
    expect(apiFetch).toHaveBeenCalledWith(`/lessons/${LESSON_ID}/pipeline/retry`, { method: 'POST' });
    expect(refresh).toHaveBeenCalledTimes(1);

    // Already retried elsewhere: refresh silently, no message.
    apiFetch.mockRejectedValueOnce(apiError(409, 'PIPE001'));
    await user.click(within(ownSteps()[5]!).getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();

    // A recording failure is F07's retry.
    apiFetch.mockRejectedValueOnce(apiError(409, 'PIPE002')).mockResolvedValueOnce(recordingView());
    await user.click(within(ownSteps()[5]!).getByRole('button', { name: 'Retry' }));
    expect(apiFetch).toHaveBeenLastCalledWith(`/lessons/${LESSON_ID}/recording/retry`, { method: 'POST' });
  });

  it('a_failed_recording_retries_through_the_recording_route', async () => {
    const user = userEvent.setup();
    apiFetch.mockRejectedValueOnce(apiError(409, 'REC001', 'This recording can no longer be retried.'));
    render(
      <StatusArea
        lesson={detail({ status: 'failed', statusReason: 'No audio was recorded for you.' })}
        pipeline={ok(
          pipelineView([
            pipelineStage({
              stage: 'recording',
              status: 'failed',
              finishedAt: '2026-09-24T15:03:30.000Z',
              reasonCode: 'recording_missing',
              reason: 'No audio was recorded for you.',
            }),
          ]),
        )}
        recording={ok(
          recordingView({
            recordingStatus: 'missing',
            branch: {
              stage: 'recording',
              status: 'failed',
              failureCode: 'recording_missing',
              failureReason: 'No audio was recorded for you.',
              retryable: true,
              fallbackPlanRequested: false,
            },
          }),
        )}
      />,
    );
    await user.click(within(ownSteps()[1]!).getByRole('button', { name: 'Retry' }));
    expect(apiFetch).toHaveBeenCalledWith(`/lessons/${LESSON_ID}/recording/retry`, { method: 'POST' });
    expect(await screen.findByRole('alert')).toHaveTextContent('This recording can no longer be retried.');
    expect(refresh).toHaveBeenCalled();
  });

  it('the_pronunciation_step_shows_its_progress', () => {
    render(
      <StatusArea
        lesson={detail({ status: 'processing' })}
        pipeline={ok(
          pipelineView([
            pipelineStage({ stage: 'recording', status: 'completed', finishedAt: '2026-09-24T15:03:30.000Z' }),
            pipelineStage({ stage: 'pronunciation_assessment', status: 'running', startedAt: '2026-09-24T15:09:00.000Z', progress: { done: 4, total: 12 } }),
          ]),
        )}
        recording={ok(recordingView())}
      />,
    );
    const running = ownSteps()[4]!;
    expect(running).toHaveTextContent('Assessing pronunciation');
    expect(running).toHaveTextContent('4 of 12 excerpts');
    expect(running).toHaveTextContent('1m 00s so far');
  });

  it('others_show_no_reason_or_retry', () => {
    render(<StatusArea lesson={detail()} pipeline={ok(pipelineView())} recording={ok(recordingView())} />);
    const others = screen.getByRole('list', { name: "Ana's processing" });
    expect(within(others).queryByRole('button')).toBeNull();
    expect(within(others).queryByRole('link')).toBeNull();
    expect(others).not.toHaveTextContent(/Blocked|Failed|Details|Retry/);
  });

  it('a_partial_recording_shows_its_captured_duration', () => {
    render(
      <StatusArea
        lesson={detail({ flags: ['partial'] })}
        pipeline={ok(pipelineView())}
        recording={ok(recordingView({ recordingStatus: 'partial', capturedSeconds: 42 * 60 }))}
      />,
    );
    expect(ownSteps()[1]).toHaveTextContent('Captured 42 min of audio');
  });
});
