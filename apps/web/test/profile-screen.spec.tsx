import type {
  CompetencySnapshotView,
  LearningProfileView,
  LedgerEntryDetailView,
  LedgerEntryView,
} from '@english-quest/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProfile, fetchLedgerEntry, findLedgerEntryByTag } = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  fetchLedgerEntry: vi.fn(),
  findLedgerEntryByTag: vi.fn(),
}));

vi.mock('@/lib/profile', () => ({ fetchProfile, fetchLedgerEntry, findLedgerEntryByTag }));

import { ProfileScreen } from '@/components/profile/profile-screen';

const SERVER_TIME = '2026-09-25T10:00:00.000Z';

function competency(overrides: Partial<CompetencySnapshotView> & Pick<CompetencySnapshotView, 'competency'>): CompetencySnapshotView {
  return {
    score: 70,
    delta: 2,
    measurementCount: 4,
    warmingUp: false,
    trend: 'up',
    lastMeasuredAt: '2026-09-20T18:00:00.000Z',
    subScores: null,
    ...overrides,
  };
}

function entry(overrides: Partial<LedgerEntryView> = {}): LedgerEntryView {
  return {
    id: '2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60',
    tag: 'grammar:conditional-3',
    label: 'Third conditional',
    family: 'grammar',
    occurrenceCount: 6,
    recentOccurrenceCount: 4,
    firstSeenAt: '2026-09-02T18:00:00.000Z',
    lastSeenAt: '2026-09-22T10:00:00.000Z',
    state: 'new',
    dueAt: null,
    trend: 'rising',
    retired: false,
    ...overrides,
  };
}

function view(overrides: Partial<LearningProfileView> = {}): LearningProfileView {
  return {
    serverTime: SERVER_TIME,
    updatedAt: '2026-09-24T19:12:04.000Z',
    empty: false,
    competencies: [
      competency({ competency: 'grammar', score: 68, delta: 3 }),
      competency({ competency: 'vocabulary', score: 74, delta: -1, trend: 'flat' }),
      competency({ competency: 'fluency', score: 71, delta: 0, trend: 'flat' }),
      competency({ competency: 'interaction', score: 77, delta: 2, measurementCount: 2, warmingUp: true, trend: null }),
      competency({ competency: 'comprehension', score: 80, delta: 1, trend: 'flat' }),
      competency({ competency: 'pronunciation', score: 72, delta: 2, subScores: { accuracy: 81, prosody: 66 } }),
    ],
    recurringWeaknesses: [entry()],
    notes: [],
    ...overrides,
  };
}

function detail(): LedgerEntryDetailView {
  return {
    serverTime: SERVER_TIME,
    entry: entry(),
    examples: [
      {
        sourceKind: 'lesson',
        lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
        activityId: null,
        occurredAt: '2026-09-22T10:00:00.000Z',
        quote: 'if I would have known',
        correction: 'if I had known',
        exampleWords: [],
        instances: 1,
      },
    ],
    sources: [
      {
        sourceKind: 'lesson',
        lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
        activityId: null,
        occurredAt: '2026-09-22T10:00:00.000Z',
        occurrences: 2,
      },
    ],
  };
}

beforeEach(() => {
  fetchProfile.mockReset();
  fetchLedgerEntry.mockReset();
  findLedgerEntryByTag.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ProfileScreen', () => {
  it('renders_six_meters_in_order_with_deltas', () => {
    render(<ProfileScreen initialView={view()} initialTag={null} />);

    expect(screen.getByRole('heading', { name: 'Learning profile' })).toBeInTheDocument();
    const meters = screen.getAllByRole('meter');
    expect(meters.map((meter) => meter.getAttribute('aria-label'))).toEqual([
      'Grammar',
      'Vocabulary',
      'Fluency',
      'Comprehension',
      'Pronunciation',
    ]);
    expect(screen.getByRole('meter', { name: 'Grammar' })).toHaveAttribute('aria-valuenow', '68');
    const grammarRow = screen.getByRole('meter', { name: 'Grammar' }).parentElement!;
    expect(grammarRow).toHaveTextContent('68 ▲ +3');
    expect(screen.getByRole('meter', { name: 'Vocabulary' }).parentElement!).toHaveTextContent('74 ▼ -1');
  });

  it('warming_up_competencies_show_the_marker', () => {
    render(<ProfileScreen initialView={view()} initialTag={null} />);

    expect(screen.getByText('Warming up')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Interaction: warming up, not enough data yet' })).toBeInTheDocument();
    expect(screen.queryByRole('meter', { name: 'Interaction' })).toBeNull();
  });

  it('pronunciation_expands_to_accuracy_and_prosody', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen initialView={view()} initialTag={null} />);

    const toggle = screen.getByRole('button', { name: 'Show accuracy and prosody' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('meter', { name: 'Accuracy' })).toBeNull();

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide accuracy and prosody' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('meter', { name: 'Accuracy' })).toHaveAttribute('aria-valuenow', '81');
    expect(screen.getByRole('meter', { name: 'Prosody' })).toHaveAttribute('aria-valuenow', '66');
  });

  it('prosody_not_measured_reads_as_such', async () => {
    const user = userEvent.setup();
    const competencies = view().competencies.map((entry) =>
      entry.competency === 'pronunciation' ? { ...entry, subScores: { accuracy: 81, prosody: null } } : entry,
    );
    render(<ProfileScreen initialView={view({ competencies })} initialTag={null} />);

    await user.click(screen.getByRole('button', { name: 'Show accuracy and prosody' }));

    expect(screen.getByText('Prosody: not measured for this language')).toBeInTheDocument();
    expect(screen.queryByRole('meter', { name: 'Prosody' })).toBeNull();
  });

  it('recurring_rows_show_label_count_last_seen_state_and_trend', () => {
    render(<ProfileScreen initialView={view()} initialTag={null} />);

    const row = screen.getByRole('button', {
      name: 'Third conditional: 6 times, last seen 3 days ago, New, Rising',
    });
    expect(row).toHaveTextContent('Third conditional');
    expect(row).toHaveTextContent('6 times · last seen 3 days ago');
    expect(row).toHaveTextContent('New');
    expect(row).toHaveTextContent('▲ Rising');
    expect(screen.queryByText('grammar:conditional-3')).toBeNull();
  });

  it('an_empty_weakness_list_explains_when_a_tag_appears', () => {
    render(<ProfileScreen initialView={view({ recurringWeaknesses: [] })} initialTag={null} />);

    expect(
      screen.getByText('No recurring weaknesses yet. A tag appears here once it occurs 3 times within 30 days.'),
    ).toBeInTheDocument();
  });

  it('renders_the_partial_update_note', () => {
    const note =
      'Only Pronunciation was updated from your latest lesson. Add your Gemini key to update the other five competencies.';
    render(<ProfileScreen initialView={view({ notes: [note] })} initialTag={null} />);

    expect(screen.getByRole('note')).toHaveTextContent(note);
  });

  it('an_empty_profile_shows_the_empty_state_with_open_classroom', () => {
    render(<ProfileScreen initialView={view({ empty: true, recurringWeaknesses: [] })} initialTag={null} />);

    expect(screen.getByText('No profile yet.')).toBeInTheDocument();
    expect(screen.getByText('Your competencies appear after your first analysed lesson.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open classroom' })).toHaveAttribute('href', '/classroom');
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('a_failed_load_shows_the_error_with_retry', async () => {
    const user = userEvent.setup();
    fetchProfile.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(view());
    render(<ProfileScreen initialView={null} initialTag={null} />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your profile…');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your profile could not be loaded.');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('meter', { name: 'Grammar' })).toBeInTheDocument();
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it('opening_a_row_opens_the_detail_sheet', async () => {
    const user = userEvent.setup();
    fetchLedgerEntry.mockResolvedValue(detail());
    render(<ProfileScreen initialView={view()} initialTag={null} />);

    await user.click(screen.getByRole('button', { name: /^Third conditional:/ }));

    const dialog = screen.getByRole('dialog', { name: 'Third conditional' });
    expect(await within(dialog).findByText('“if I would have known”')).toBeInTheDocument();
    expect(fetchLedgerEntry).toHaveBeenCalledWith('2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60');
  });

  it('a_tag_in_the_address_opens_its_detail', async () => {
    fetchLedgerEntry.mockResolvedValue(detail());
    findLedgerEntryByTag.mockResolvedValue(entry());
    render(<ProfileScreen initialView={view()} initialTag="grammar:conditional-3" />);

    expect(await screen.findByRole('dialog', { name: 'Third conditional' })).toBeInTheDocument();
    expect(findLedgerEntryByTag).toHaveBeenCalledWith('grammar:conditional-3');
    await waitFor(() => expect(fetchLedgerEntry).toHaveBeenCalledTimes(1));
  });
});
