import type { ObjectiveQuestionView } from '@english-quest/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ObjectiveRunner } from '@/components/activity/objective-runner';
import { ApiRequestError } from '@/lib/api-client';
import { saveDraft } from '@/lib/activity-draft';
import {
  ACTIVITY_ID,
  answerOf,
  ATTEMPT_ID,
  fiveQuestions,
  FINGERPRINT,
  openAttempt,
  OTHER_ACTIVITY_ID,
  planEntry,
  resultOf,
  submittedView,
  viewOf,
} from './fixtures/activities';

vi.setConfig({ testTimeout: 30_000 });

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, back: vi.fn(), refresh: vi.fn() }) }));

const { startAttemptMock, submitAttemptMock } = vi.hoisted(() => ({ startAttemptMock: vi.fn(), submitAttemptMock: vi.fn() }));
vi.mock('@/lib/activities', () => ({
  startAttempt: startAttemptMock,
  submitAttempt: submitAttemptMock,
  skipActivity: vi.fn(),
  rateActivity: vi.fn(),
  activityMediaUrl: (id: string) => `http://api/activities/${id}/media`,
}));

beforeEach(() => {
  window.localStorage.clear();
  startAttemptMock.mockReset();
  submitAttemptMock.mockReset();
  push.mockReset();
  startAttemptMock.mockResolvedValue(viewOf({ state: 'in_progress', attempt: openAttempt() }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function pickOption(user: UserEvent, name: string): Promise<void> {
  await user.click(screen.getByRole('radio', { name }));
}

/** Answers the current question and moves on, whatever its format. */
async function answerCurrent(user: UserEvent, last = false): Promise<void> {
  const textbox = screen.queryByRole('textbox', { name: /Answer for question/ });
  if (textbox) {
    await user.type(textbox, 'had heard');
  } else if (screen.queryAllByRole('radio').length > 0) {
    await user.click(screen.getAllByRole('radio')[1]!);
  }
  await user.click(screen.getByRole('button', { name: last ? 'Submit answers' : 'Next question' }));
}

async function answerAll(user: UserEvent, count = 5): Promise<void> {
  for (let step = 0; step < count; step += 1) {
    await answerCurrent(user, step === count - 1);
  }
}

describe('ObjectiveRunner: answering', () => {
  it('renders_one_question_at_a_time_with_its_position', async () => {
    render(<ObjectiveRunner initialView={viewOf()} />);
    expect(await screen.findByRole('heading', { name: 'Question 1 of 5' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Question 2 of 5' })).toBeNull();
    expect(screen.getByText('What does the writer blame?')).toBeInTheDocument();
    expect(screen.queryByText('Which tone?')).toBeNull();
  });

  it('multiple_choice_options_are_a_radio_group_of_large_targets', async () => {
    render(<ObjectiveRunner initialView={viewOf()} />);
    const group = await screen.findByRole('radiogroup', { name: 'What does the writer blame?' });
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled();
  });

  it('fill_blank_renders_an_inline_input_sized_to_the_answer', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    await answerCurrent(user);

    const input = screen.getByRole('textbox', { name: 'Answer for question 2' });
    expect(input).toHaveAttribute('size', '15');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByText('If the council')).toBeInTheDocument();
  });

  it('next_locks_the_answer_and_answered_questions_are_read_only', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    await pickOption(user, 'The council');
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByRole('heading', { name: 'Question 2 of 5' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Question 1, answered' }));
    expect(screen.getByRole('heading', { name: 'Question 1 of 5' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'The council' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'The council' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Question 3, not answered yet' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Back to the current question' }));
    expect(screen.getByRole('heading', { name: 'Question 2 of 5' })).toBeInTheDocument();
  });

  it('the_first_confirmed_answer_starts_the_attempt', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    expect(startAttemptMock).not.toHaveBeenCalled();

    await pickOption(user, 'The council');
    expect(startAttemptMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await waitFor(() => expect(startAttemptMock).toHaveBeenCalledTimes(1));
    expect(startAttemptMock).toHaveBeenCalledWith(ACTIVITY_ID);

    await answerCurrent(user);
    expect(startAttemptMock).toHaveBeenCalledTimes(1);
  });

  it('the_passage_stays_rendered_beside_every_question', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    for (let step = 0; step < 3; step += 1) {
      expect(screen.getByRole('region', { name: 'Text' })).toHaveTextContent('Had the council listened');
      await answerCurrent(user);
    }
  });

  it('the_listening_transcript_appears_only_after_submission', async () => {
    const user = userEvent.setup({ delay: null });
    const listening = viewOf({ kind: 'listening', passage: null, hasAudio: true });
    submitAttemptMock.mockResolvedValue(
      submittedView({ kind: 'listening', passage: { kind: 'transcript', text: 'Presenter: tonight we ask…' }, hasAudio: true }),
    );
    render(<ObjectiveRunner initialView={listening} />);
    await screen.findByRole('radiogroup');

    expect(screen.queryByRole('region', { name: 'Transcript' })).toBeNull();
    expect(screen.getByText('The transcript appears after you submit.')).toBeInTheDocument();
    await answerAll(user);

    expect(await screen.findByRole('region', { name: 'Transcript' })).toHaveTextContent('Presenter: tonight we ask');
  });

  it('audio_that_fails_to_load_shows_the_message_and_starts_no_attempt', async () => {
    render(<ObjectiveRunner initialView={viewOf({ kind: 'listening', passage: null, hasAudio: true })} />);
    await screen.findByRole('radiogroup');

    fireEvent(screen.getByLabelText('Activity audio'), new Event('error'));
    expect(await screen.findByRole('alert')).toHaveTextContent('This audio could not be loaded.');
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(startAttemptMock).not.toHaveBeenCalled();
  });

  it('unscored_questions_show_their_message_and_need_no_answer', async () => {
    const user = userEvent.setup({ delay: null });
    const questions: ObjectiveQuestionView[] = [
      fiveQuestions()[0]!,
      { index: 1, format: 'unscored', prompt: 'Put these in order.', reason: 'format_unavailable' },
      { index: 2, format: 'unscored', prompt: null, reason: 'answer_key_invalid' },
      fiveQuestions()[3]!,
      fiveQuestions()[4]!,
    ];
    startAttemptMock.mockResolvedValue(viewOf({ questions, state: 'in_progress', attempt: openAttempt() }));
    render(<ObjectiveRunner initialView={viewOf({ questions })} />);
    await screen.findByRole('radiogroup');
    await answerCurrent(user);

    expect(screen.getByText("This question type isn't available yet.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText('This question could not be corrected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled();
  });

  it('a_draft_restores_at_the_first_unanswered_question', async () => {
    saveDraft({
      activityId: ACTIVITY_ID,
      attemptId: ATTEMPT_ID,
      fingerprint: FINGERPRINT,
      answers: [answerOf.mc(0, 1), answerOf.fill(1, 'had heard')],
      activeSeconds: 30,
      pendingSubmission: false,
      savedAt: '2026-10-02T07:40:00.000Z',
    });
    render(<ObjectiveRunner initialView={viewOf({ state: 'in_progress', attempt: openAttempt() })} />);

    expect(await screen.findByRole('heading', { name: 'Question 3 of 5' })).toBeInTheDocument();
    expect(screen.getByText('Picking up where you left off.')).toBeInTheDocument();
  });

  it('a_changed_item_clears_the_draft_with_a_notice', async () => {
    saveDraft({
      activityId: ACTIVITY_ID,
      attemptId: ATTEMPT_ID,
      fingerprint: 'e'.repeat(64),
      answers: [answerOf.mc(0, 1)],
      activeSeconds: 5,
      pendingSubmission: false,
      savedAt: '2026-10-02T07:40:00.000Z',
    });
    render(<ObjectiveRunner initialView={viewOf({ state: 'in_progress', attempt: openAttempt() })} />);

    expect(await screen.findByRole('heading', { name: 'Question 1 of 5' })).toBeInTheDocument();
    expect(screen.getByText('This activity was updated, so your answers were cleared.')).toBeInTheDocument();
  });
});

describe('ObjectiveRunner: submitting', () => {
  it('a_successful_submission_shows_the_results_and_clears_the_draft', async () => {
    const user = userEvent.setup({ delay: null });
    submitAttemptMock.mockResolvedValue(submittedView());
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    await answerAll(user);

    expect(await screen.findByRole('heading', { name: '3 of 4 correct' })).toBeInTheDocument();
    expect(submitAttemptMock).toHaveBeenCalledTimes(1);
    const [activityId, attemptId, input] = submitAttemptMock.mock.calls[0]!;
    expect(activityId).toBe(ACTIVITY_ID);
    expect(attemptId).toBe(ATTEMPT_ID);
    expect(input).toMatchObject({ questionsFingerprint: FINGERPRINT });
    expect(input.answers).toHaveLength(5);
    expect(window.localStorage.length).toBe(0);
  });

  it('a_failed_submission_keeps_the_answers_and_offers_retry', async () => {
    const user = userEvent.setup({ delay: null });
    submitAttemptMock.mockRejectedValueOnce(new ApiRequestError(500, { error: { code: 'ERR500', message: 'Something went wrong on our side.', details: null } }));
    submitAttemptMock.mockResolvedValue(submittedView());
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    await answerAll(user);

    expect(await screen.findByText('Your answers could not be saved. Retry?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /correct$/ })).toBeNull();
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
    expect(window.localStorage.length).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: '3 of 4 correct' })).toBeInTheDocument();
  });

  it('an_offline_submission_waits_and_sends_on_reconnect', async () => {
    const user = userEvent.setup({ delay: null });
    submitAttemptMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    submitAttemptMock.mockResolvedValue(submittedView());
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    await answerAll(user);

    expect(await screen.findByText(/You're offline\. Your answers are saved on this device/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /correct$/ })).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByRole('heading', { name: '3 of 4 correct' })).toBeInTheDocument();
    expect(submitAttemptMock).toHaveBeenCalledTimes(2);
  });

  it('a_pending_submission_is_resent_when_the_activity_reopens', async () => {
    saveDraft({
      activityId: ACTIVITY_ID,
      attemptId: ATTEMPT_ID,
      fingerprint: FINGERPRINT,
      answers: [0, 1, 2, 3, 4].map((index) => (index % 2 === 1 ? answerOf.fill(index, 'had heard') : answerOf.mc(index, 1))),
      activeSeconds: 90,
      pendingSubmission: true,
      savedAt: '2026-10-02T07:40:00.000Z',
    });
    submitAttemptMock.mockResolvedValue(submittedView());
    render(<ObjectiveRunner initialView={viewOf({ state: 'in_progress', attempt: openAttempt() })} />);

    expect(await screen.findByRole('heading', { name: '3 of 4 correct' })).toBeInTheDocument();
    expect(submitAttemptMock.mock.calls[0]![2].timeSpentSeconds).toBeGreaterThanOrEqual(90);
  });

  it('a_skip_made_elsewhere_ends_on_the_skipped_state', async () => {
    const user = userEvent.setup({ delay: null });
    startAttemptMock.mockRejectedValue(new ApiRequestError(409, { error: { code: 'ACT003', message: 'This activity was skipped.', details: null } }));
    render(<ObjectiveRunner initialView={viewOf()} />);
    await screen.findByRole('radiogroup');
    await pickOption(user, 'The council');
    await user.click(screen.getByRole('button', { name: 'Next question' }));

    expect(await screen.findByText('You skipped this activity.')).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
  });
});

describe('ObjectiveRunner: results and terminal states', () => {
  it('results_expand_incorrect_questions_and_collapse_correct_ones', async () => {
    render(<ObjectiveRunner initialView={submittedView()} />);
    await screen.findByRole('heading', { name: '3 of 4 correct' });

    expect(screen.getByText("1 question wasn't scored.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Question 1: Correct/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Question 2: Incorrect/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Question 3: Correct/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Question 5: Not scored/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('results_show_the_answer_the_correct_answer_and_the_explanation', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ObjectiveRunner initialView={submittedView()} />);
    await screen.findByRole('heading', { name: '3 of 4 correct' });

    expect(screen.getByText('would have heard')).toBeInTheDocument();
    expect(screen.getByText('had listened to')).toBeInTheDocument();
    expect(screen.getByText('A third conditional puts the past perfect in the if-clause.')).toBeInTheDocument();
    expect(screen.getByText('Also accepted: had heard')).toBeInTheDocument();

    expect(screen.queryByText('Paragraph two.')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Question 1: Correct/ }));
    expect(screen.getByText('Paragraph two.')).toBeInTheDocument();
  });

  it('the_next_action_follows_the_session_and_never_skips_ahead', async () => {
    const { unmount } = render(<ObjectiveRunner initialView={submittedView()} />);
    const next = await screen.findByRole('link', { name: 'Next activity' });
    expect(next).toHaveAttribute('href', `/activities/${OTHER_ACTIVITY_ID}`);
    unmount();

    const finished = submittedView({
      session: [planEntry({ id: ACTIVITY_ID, state: 'completed' }), planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'grammar', state: 'completed' })],
    });
    render(<ObjectiveRunner initialView={finished} />);
    expect(await screen.findByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '/dashboard');
  });

  it('a_plan_that_was_replaced_still_shows_the_results_with_a_note', async () => {
    const view = submittedView({ readOnly: true });
    view.activity.state = 'in_progress';
    render(<ObjectiveRunner initialView={view} />);
    expect(await screen.findByText('This activity is no longer in your current plan. Your answers still count toward your profile.')).toBeInTheDocument();
    expect(screen.queryByText('How was this activity?')).toBeNull();
  });

  it('a_skipped_or_unrunnable_activity_shows_its_terminal_state', async () => {
    const { unmount } = render(<ObjectiveRunner initialView={viewOf({ state: 'skipped', skipReason: 'Not relevant to me' })} />);
    expect(await screen.findByText('You skipped this activity.')).toBeInTheDocument();
    expect(screen.getByText('Reason: Not relevant to me')).toBeInTheDocument();
    unmount();

    render(<ObjectiveRunner initialView={viewOf({ runnable: false })} />);
    expect(await screen.findByText('This activity could not be corrected.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });
});

describe('result fixtures', () => {
  it('keep_the_fixture_internally_consistent', () => {
    expect(resultOf().questions).toHaveLength(5);
  });
});
