import type { LedgerEntryDetailView, LearningProfileView } from '@english-quest/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProfile, fetchLedgerEntry, findLedgerEntryByTag } = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  fetchLedgerEntry: vi.fn(),
  findLedgerEntryByTag: vi.fn(),
}));

vi.mock('@/lib/profile', () => ({ fetchProfile, fetchLedgerEntry, findLedgerEntryByTag }));

import { LedgerEntrySheet, LESSON_DETAIL_HREF } from '@/components/profile/ledger-entry-sheet';
import { ProfileScreen } from '@/components/profile/profile-screen';

const SERVER_TIME = '2026-09-25T10:00:00.000Z';
const LESSON_ID = '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21';
const ACTIVITY_ID = '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f';

function detail(overrides: Partial<LedgerEntryDetailView> = {}): LedgerEntryDetailView {
  return {
    serverTime: SERVER_TIME,
    entry: {
      id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      tag: 'grammar:conditional-3',
      label: 'Third conditional',
      family: 'grammar',
      occurrenceCount: 3,
      recentOccurrenceCount: 3,
      firstSeenAt: '2026-09-10T10:00:00.000Z',
      lastSeenAt: '2026-09-24T10:00:00.000Z',
      state: 'practicing',
      dueAt: null,
      trend: 'rising',
      retired: false,
    },
    examples: [
      {
        sourceKind: 'activity',
        lessonId: null,
        activityId: ACTIVITY_ID,
        occurredAt: '2026-09-24T10:00:00.000Z',
        quote: 'If she would have called, I would have come.',
        correction: null,
        exampleWords: [],
        instances: 1,
      },
      {
        sourceKind: 'lesson',
        lessonId: LESSON_ID,
        activityId: null,
        occurredAt: '2026-09-22T10:00:00.000Z',
        quote: 'if I would have known',
        correction: 'if I had known',
        exampleWords: [],
        instances: 1,
      },
    ],
    sources: [
      { sourceKind: 'activity', lessonId: null, activityId: ACTIVITY_ID, occurredAt: '2026-09-24T10:00:00.000Z', occurrences: 1 },
      { sourceKind: 'lesson', lessonId: LESSON_ID, activityId: null, occurredAt: '2026-09-22T10:00:00.000Z', occurrences: 2 },
    ],
    ...overrides,
  };
}

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <LedgerEntrySheet
      entryId="7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
      label="Third conditional"
      onClose={() => {
        setOpen(false);
        onClose();
      }}
    />
  ) : null;
}

beforeEach(() => {
  fetchLedgerEntry.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('LedgerEntrySheet', () => {
  it('shows_examples_and_sources', async () => {
    fetchLedgerEntry.mockResolvedValue(detail());
    render(<Harness onClose={() => undefined} />);

    const dialog = screen.getByRole('dialog', { name: 'Third conditional' });
    expect(await within(dialog).findByText('“if I would have known”')).toBeInTheDocument();
    expect(within(dialog).getByText('Correction: if I had known')).toBeInTheDocument();
    expect(within(dialog).getByText('“If she would have called, I would have come.”')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Seen 3 times · first seen 10 Sep · last seen Yesterday');
    expect(within(dialog).getByText('Practicing')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Activity · Yesterday')).toHaveLength(2);
    expect(within(dialog).getAllByText('Lesson · 3 days ago')).toHaveLength(2);
    expect(within(dialog).getByText('2 times')).toBeInTheDocument();
  });

  it('lesson_examples_render_as_text_until_f19_ships_lesson_detail', async () => {
    fetchLedgerEntry.mockResolvedValue(detail());
    render(<Harness onClose={() => undefined} />);

    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('“if I would have known”');

    // A27: F19 owns `/lessons/{id}`. Until it ships, a lesson source is plain text, never a dead link.
    expect(LESSON_DETAIL_HREF).toBeNull();
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
  });

  it('phoneme_examples_show_their_words', async () => {
    fetchLedgerEntry.mockResolvedValue(
      detail({
        examples: [
          {
            sourceKind: 'lesson',
            lessonId: LESSON_ID,
            activityId: null,
            occurredAt: '2026-09-22T10:00:00.000Z',
            quote: null,
            correction: null,
            exampleWords: ['think', 'three'],
            instances: 4,
          },
        ],
      }),
    );
    render(<Harness onClose={() => undefined} />);

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/Words: “think”, “three”/)).toHaveTextContent('(4 failing instances)');
  });

  it('shows_loading_then_error_with_retry', async () => {
    const user = userEvent.setup();
    fetchLedgerEntry.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(detail());
    render(<Harness onClose={() => undefined} />);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading examples…');
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('This record could not be loaded.');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await within(dialog).findByText('“if I would have known”')).toBeInTheDocument();
    expect(fetchLedgerEntry).toHaveBeenCalledTimes(2);
  });

  it('closes_on_escape_and_returns_focus_to_the_row', async () => {
    const user = userEvent.setup();
    fetchLedgerEntry.mockResolvedValue(detail());
    const view: LearningProfileView = {
      serverTime: SERVER_TIME,
      updatedAt: SERVER_TIME,
      empty: false,
      competencies: (['grammar', 'vocabulary', 'fluency', 'interaction', 'comprehension', 'pronunciation'] as const).map(
        (competency) => ({
          competency,
          score: 70,
          delta: null,
          measurementCount: 1,
          warmingUp: true,
          trend: null,
          lastMeasuredAt: SERVER_TIME,
          subScores: null,
        }),
      ),
      recurringWeaknesses: [detail().entry],
      notes: [],
    };
    render(<ProfileScreen initialView={view} initialTag={null} />);

    const row = screen.getByRole('button', { name: /^Third conditional:/ });
    await user.click(row);
    const dialog = screen.getByRole('dialog', { name: 'Third conditional' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row).toHaveFocus();
  });
});
