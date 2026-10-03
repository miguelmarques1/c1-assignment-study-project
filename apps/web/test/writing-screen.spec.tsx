import type { WritingActivityView } from '@english-quest/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/lib/api-client';
import { WritingScreen } from '@/components/writing/writing-screen';

const { openWritingMock, getWritingMock, saveWritingDraftMock, submitWritingMock } = vi.hoisted(() => ({
  openWritingMock: vi.fn(),
  getWritingMock: vi.fn(),
  saveWritingDraftMock: vi.fn(),
  submitWritingMock: vi.fn(),
}));

vi.mock('@/lib/writing', () => ({
  openWriting: (...args: unknown[]) => openWritingMock(...args),
  getWriting: (...args: unknown[]) => getWritingMock(...args),
  saveWritingDraft: (...args: unknown[]) => saveWritingDraftMock(...args),
  submitWriting: (...args: unknown[]) => submitWritingMock(...args),
}));

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';

function view(overrides: Partial<WritingActivityView> = {}): WritingActivityView {
  return {
    activityId: ACTIVITY_ID,
    taskId: '22222222-2222-4222-8222-222222222222',
    planId: '33333333-3333-4333-8333-333333333333',
    activityState: 'in_progress',
    readOnly: false,
    title: 'Writing: Third conditional',
    task: {
      heading: 'Letter to the editor',
      statement: 'Write a letter to the editor about the riverside park.',
      targetTags: [{ tag: 'grammar:conditional-3', label: 'Third conditional' }],
    },
    status: 'draft',
    draft: { text: '', revision: 0, savedAt: null },
    submittedAt: null,
    failure: null,
    correction: null,
    submission: { geminiKeyUsable: true, dailyLimit: { max: 10, used: 0, resetsAt: null } },
    serverTime: '2026-10-02T08:42:03.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  openWritingMock.mockReset();
  getWritingMock.mockReset();
  saveWritingDraftMock.mockReset();
  submitWritingMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WritingScreen', () => {
  it('shows_the_task_and_collapses_it', async () => {
    const user = userEvent.setup();
    openWritingMock.mockResolvedValue(
      view({ status: 'draft', draft: { text: 'Already started writing something here.', revision: 2, savedAt: '2026-10-02T08:00:00.000Z' } }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText('Letter to the editor');
    expect(screen.queryByText(/riverside park/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show task/ }));
    expect(screen.getByText(/riverside park/)).toBeInTheDocument();
  });

  it('submit_is_disabled_below_80_words_and_the_counter_turns_green_at_80', async () => {
    const user = userEvent.setup();
    openWritingMock.mockResolvedValue(view());
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    const editor = await screen.findByLabelText('Your writing');
    const seventyNineWords = Array.from({ length: 79 }, () => 'word').join(' ');
    await user.click(editor);
    await user.paste(seventyNineWords);

    expect(screen.getByText('79 of 80 words')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for correction' })).toBeDisabled();

    await user.type(editor, ' more');
    expect(screen.getByText('80 words')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for correction' })).toBeEnabled();
  });

  it('shows_saved_with_a_relative_time', async () => {
    openWritingMock.mockResolvedValue(
      view({ draft: { text: 'Some text', revision: 1, savedAt: new Date().toISOString() } }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText(/Saved/);
    expect(screen.getByText('Saved just now')).toBeInTheDocument();
  });

  it('a_missing_key_shows_the_prd_message_with_a_settings_link', async () => {
    openWritingMock.mockResolvedValue(view({ submission: { geminiKeyUsable: false, dailyLimit: { max: 10, used: 0, resetsAt: null } } }));
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText('Add your Gemini key to have your writing corrected.');
    expect(screen.getByRole('link', { name: 'Go to settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Submit for correction' })).toBeDisabled();
  });

  it('the_limit_message_shows_the_reset_time', async () => {
    openWritingMock.mockResolvedValue(
      view({ submission: { geminiKeyUsable: true, dailyLimit: { max: 10, used: 10, resetsAt: '2026-10-03T06:12:40.000Z' } } }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText(/reached today.s limit of 10 corrections/);
    expect(screen.getByText(/Resets/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for correction' })).toBeDisabled();
  });

  it('confirmation_names_the_gemini_key_and_that_it_cannot_be_undone', async () => {
    const user = userEvent.setup();
    openWritingMock.mockResolvedValue(
      view({ draft: { text: Array.from({ length: 90 }, () => 'word').join(' '), revision: 1, savedAt: null } }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await user.click(await screen.findByRole('button', { name: 'Submit for correction' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit for correction?' });
    expect(within(dialog).getByText(/your Gemini key/)).toBeInTheDocument();
    expect(within(dialog).getByText(/can.t be edited or undone/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('submitting_shows_checking_your_writing_with_the_text_visible', async () => {
    const user = userEvent.setup();
    const text = Array.from({ length: 90 }, () => 'word').join(' ');
    openWritingMock.mockResolvedValue(view({ draft: { text, revision: 1, savedAt: '2026-10-02T08:00:00.000Z' } }));
    saveWritingDraftMock.mockResolvedValue({ revision: 1, savedAt: '2026-10-02T08:00:00.000Z', status: 'draft' });
    submitWritingMock.mockResolvedValue(view({ status: 'correcting', draft: { text, revision: 1, savedAt: '2026-10-02T08:00:00.000Z' } }));
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await user.click(await screen.findByRole('button', { name: 'Submit for correction' }));
    await user.click(await screen.findByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Checking your writing…')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('a_request_failure_shows_the_saved_text_and_retry', async () => {
    openWritingMock.mockResolvedValue(
      view({
        status: 'uncorrected',
        draft: { text: 'My saved text.', revision: 2, savedAt: '2026-10-02T08:00:00.000Z' },
        submittedAt: '2026-10-02T08:10:00.000Z',
        failure: { code: 'request_failed', message: 'Correction failed. Your text is saved — retry when ready.' },
      }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText('Correction failed. Your text is saved — retry when ready.');
    expect(screen.getByRole('button', { name: 'Retry correction' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('My saved text.')).toBeInTheDocument();
  });

  it('invalid_output_offers_a_retry', async () => {
    openWritingMock.mockResolvedValue(
      view({
        status: 'correction_failed',
        draft: { text: 'My saved text.', revision: 2, savedAt: '2026-10-02T08:00:00.000Z' },
        submittedAt: '2026-10-02T08:10:00.000Z',
        failure: { code: 'invalid_output', message: 'The correction came back in an unexpected format. Your text is saved — retry when ready.' },
      }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText('The correction came back in an unexpected format. Your text is saved — retry when ready.');
    expect(screen.getByRole('button', { name: 'Retry correction' })).toBeInTheDocument();
  });

  it('a_conflict_shows_the_banner_and_the_local_version', async () => {
    const user = userEvent.setup();
    const startingText = Array.from({ length: 85 }, () => 'word').join(' ');
    openWritingMock.mockResolvedValue(view({ draft: { text: startingText, revision: 3, savedAt: '2026-10-02T08:00:00.000Z' } }));
    saveWritingDraftMock.mockRejectedValue(
      new ApiRequestError(409, {
        error: {
          code: 'WRIT004',
          message: 'This draft was updated on another device.',
          details: { draft: { text: 'Server copy wins', revision: 9, savedAt: null } },
        },
      }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    const editor = await screen.findByLabelText('Your writing');
    await user.click(editor);
    await user.type(editor, ' edited');

    // Force a server save rather than waiting on the real 30s timer.
    await user.click(screen.getByRole('button', { name: 'Submit for correction' }));
    await user.click(await screen.findByRole('button', { name: 'Submit' }));

    await screen.findByText('This draft was updated on another device.');
    await user.click(screen.getByRole('button', { name: 'View your version' }));
    expect(screen.getByText(/edited/)).toBeInTheDocument();
  });

  it('an_archived_activity_is_read_only', async () => {
    openWritingMock.mockResolvedValue(
      view({ readOnly: true, draft: { text: 'Frozen text from before.', revision: 1, savedAt: '2026-10-02T08:00:00.000Z' } }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText('Frozen text from before.');
    expect(screen.queryByRole('button', { name: 'Submit for correction' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your writing')).not.toBeInTheDocument();
  });

  it('an_unknown_activity_shows_not_found', async () => {
    openWritingMock.mockRejectedValue(
      new ApiRequestError(404, { error: { code: 'PLAN003', message: 'This activity could not be found.', details: null } }),
    );
    render(<WritingScreen activityId={ACTIVITY_ID} />);

    await screen.findByText('This activity could not be found.');
  });
});
