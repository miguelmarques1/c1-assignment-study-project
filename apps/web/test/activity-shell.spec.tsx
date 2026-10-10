import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityShell } from '@/components/activity/activity-shell';
import { RatingPrompt } from '@/components/activity/rating-prompt';
import { ResultsView } from '@/components/activity/results-view';
import { SessionProgress } from '@/components/activity/session-progress';
import { ApiRequestError } from '@/lib/api-client';
import { nextStep } from '@/lib/activity-navigation';
import { ACTIVITY_ID, OTHER_ACTIVITY_ID, planEntry, submittedView, viewOf } from './fixtures/activities';

const push = vi.fn();
const back = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, back, refresh: vi.fn() }) }));

const { skipActivityMock, rateActivityMock } = vi.hoisted(() => ({ skipActivityMock: vi.fn(), rateActivityMock: vi.fn() }));
vi.mock('@/lib/activities', () => ({
  skipActivity: skipActivityMock,
  rateActivity: rateActivityMock,
}));

beforeEach(() => {
  push.mockReset();
  back.mockReset();
  skipActivityMock.mockReset();
  rateActivityMock.mockReset();
  window.localStorage.clear();
});

afterEach(cleanup);

describe('SessionProgress', () => {
  it('session_progress_reports_position_as_a_progressbar', () => {
    const view = viewOf({
      session: [
        planEntry({ id: 'a1a1a1a1-0000-4000-8000-000000000001', position: 1, state: 'completed' }),
        planEntry({ id: ACTIVITY_ID, position: 2 }),
        planEntry({ id: OTHER_ACTIVITY_ID, position: 3, state: 'pending' }),
      ],
    });
    view.session.position = 2;
    render(<SessionProgress session={view.session} currentId={ACTIVITY_ID} />);

    const bar = screen.getByRole('progressbar', { name: 'Session progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText('Activity 2 of 3')).toBeInTheDocument();
  });
});

describe('ActivityShell', () => {
  it('close_goes_back_or_to_today', async () => {
    const user = userEvent.setup();
    render(
      <ActivityShell view={viewOf()}>
        <p>body</p>
      </ActivityShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Close activity' }));
    // jsdom starts with a single history entry, so there is nothing to go back to.
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('skip_is_hidden_once_the_activity_is_done_or_read_only', () => {
    const { rerender } = render(
      <ActivityShell view={submittedView()}>
        <p>body</p>
      </ActivityShell>,
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    rerender(
      <ActivityShell view={viewOf({ readOnly: true, state: 'in_progress' })}>
        <p>body</p>
      </ActivityShell>,
    );
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('skip_requires_a_reason_and_offers_presets_and_other', async () => {
    const user = userEvent.setup();
    render(
      <ActivityShell view={viewOf()}>
        <p>body</p>
      </ActivityShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    const dialog = screen.getByRole('dialog', { name: 'Skip this activity?' });
    for (const preset of ['Not relevant to me', 'Too difficult right now', 'Not enough time today', "Something isn't working", 'Other']) {
      expect(within(dialog).getByRole('radio', { name: preset })).toBeInTheDocument();
    }

    await user.click(within(dialog).getByRole('radio', { name: 'Other' }));
    expect(within(dialog).getByRole('button', { name: 'Skip activity' })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Your reason' }), '  Travelling  ');
    expect(within(dialog).getByRole('button', { name: 'Skip activity' })).toBeEnabled();

    skipActivityMock.mockResolvedValue(viewOf({ state: 'skipped' }));
    await user.click(within(dialog).getByRole('button', { name: 'Skip activity' }));
    expect(skipActivityMock).toHaveBeenCalledWith(ACTIVITY_ID, 'Travelling');
  });

  it('skip_navigates_to_the_next_step', async () => {
    const user = userEvent.setup();
    skipActivityMock.mockResolvedValue(
      viewOf({
        state: 'skipped',
        session: [planEntry({ id: ACTIVITY_ID, position: 1, state: 'skipped' }), planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'grammar', state: 'pending' })],
      }),
    );
    render(
      <ActivityShell view={viewOf()}>
        <p>body</p>
      </ActivityShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Skip activity' }));

    expect(skipActivityMock).toHaveBeenCalledWith(ACTIVITY_ID, 'Not relevant to me');
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/activities/${OTHER_ACTIVITY_ID}`));
  });

  it('a_failed_skip_keeps_the_dialog_open_with_the_message', async () => {
    const user = userEvent.setup();
    skipActivityMock.mockRejectedValue(new ApiRequestError(409, { error: { code: 'PLAN004', message: 'This activity is no longer in your current plan.', details: null } }));
    render(
      <ActivityShell view={viewOf()}>
        <p>body</p>
      </ActivityShell>,
    );
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Skip activity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This activity is no longer in your current plan.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('RatingPrompt', () => {
  it('a_rating_marks_the_chosen_button_pressed', async () => {
    const user = userEvent.setup();
    rateActivityMock.mockResolvedValue({ rating: 'just_right', notUseful: false, ratedAt: '2026-10-02T07:45:00.000Z' });
    render(<RatingPrompt activityId={ACTIVITY_ID} />);

    expect(screen.getByRole('button', { name: 'Just right' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Just right' }));
    expect(rateActivityMock).toHaveBeenCalledWith(ACTIVITY_ID, { rating: 'just_right', notUseful: false });
    expect(screen.getByRole('button', { name: 'Just right' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Too easy' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('not_useful_toggles_independently', async () => {
    const user = userEvent.setup();
    rateActivityMock.mockResolvedValue({ rating: null, notUseful: true, ratedAt: '2026-10-02T07:45:00.000Z' });
    render(<RatingPrompt activityId={ACTIVITY_ID} />);

    await user.click(screen.getByRole('button', { name: 'Not useful' }));
    expect(rateActivityMock).toHaveBeenLastCalledWith(ACTIVITY_ID, { rating: null, notUseful: true });
    expect(screen.getByRole('button', { name: 'Not useful' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Too easy' }));
    expect(rateActivityMock).toHaveBeenLastCalledWith(ACTIVITY_ID, { rating: 'too_easy', notUseful: true });
    expect(screen.getByRole('button', { name: 'Not useful' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the_rating_prompt_is_dismissible_and_never_blocks_the_next_action', async () => {
    const user = userEvent.setup();
    const view = submittedView();
    render(<ResultsView view={view} next={nextStep(view)} />);

    expect(screen.getByRole('link', { name: 'Next activity' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('How was this activity?')).toBeNull();
    expect(rateActivityMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Next activity' })).toBeInTheDocument();
  });

  it('a_failed_rating_offers_retry_without_blocking', async () => {
    const user = userEvent.setup();
    rateActivityMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ rating: 'too_hard', notUseful: false, ratedAt: '2026-10-02T07:45:00.000Z' });
    const view = submittedView();
    render(<ResultsView view={view} next={nextStep(view)} />);

    await user.click(screen.getByRole('button', { name: 'Too hard' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your rating could not be saved.');
    expect(screen.getByRole('link', { name: 'Next activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Too hard' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Too hard' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
