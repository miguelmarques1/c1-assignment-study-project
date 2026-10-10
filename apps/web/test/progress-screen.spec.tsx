import type { LedgerEntryDetailView, ProgressDashboardView } from '@english-quest/shared';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProgress, fetchLedgerEntry, findLedgerEntryByTag, fetchProfile } = vi.hoisted(() => ({
  fetchProgress: vi.fn(),
  fetchLedgerEntry: vi.fn(),
  findLedgerEntryByTag: vi.fn(),
  fetchProfile: vi.fn(),
}));

vi.mock('@/lib/progress', () => ({ fetchProgress }));
vi.mock('@/lib/profile', () => ({ fetchProfile, fetchLedgerEntry, findLedgerEntryByTag }));

import { ProgressScreen } from '@/components/progress/progress-screen';
import fixture from './fixtures/progress-view.json';

const base = fixture.data as unknown as ProgressDashboardView;

function viewWith(overrides: {
  profile?: Partial<ProgressDashboardView['profile']>;
  competencyHistory?: Partial<ProgressDashboardView['competencyHistory']>;
}): ProgressDashboardView {
  return {
    ...base,
    profile: { ...base.profile, ...overrides.profile },
    competencyHistory: { ...base.competencyHistory, ...overrides.competencyHistory },
  };
}

function detail(): LedgerEntryDetailView {
  return {
    serverTime: base.serverTime,
    entry: base.profile.recurringWeaknesses[0]!,
    examples: [],
    sources: [],
  };
}

function markers(container: HTMLElement): number {
  return container.querySelectorAll('[data-marker]').length;
}

beforeEach(() => {
  fetchProgress.mockReset();
  fetchLedgerEntry.mockReset();
  findLedgerEntryByTag.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ProgressScreen', () => {
  it('opens_on_the_chart_with_six_legend_tiles', () => {
    render(<ProgressScreen initialView={base} />);

    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to profile' })).toHaveAttribute('href', '/profile');
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Competencies over time', 'Recurring weaknesses']);
    const tiles = screen.getAllByRole('button', { pressed: true });
    expect(tiles).toHaveLength(6);
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Grammar: 68, improving',
      'Vocabulary: 74, improving',
      'Fluency: 71, steady',
      'Interaction: warming up',
      'Comprehension: 80, declining',
      'Pronunciation: warming up',
    ]);
  });

  it('legend_tiles_show_score_trend_or_warming_up', () => {
    render(<ProgressScreen initialView={base} />);

    const grammar = screen.getByRole('button', { name: 'Grammar: 68, improving' });
    expect(grammar).toHaveTextContent('68');
    expect(grammar).toHaveTextContent('▲ Improving');
    const pronunciation = screen.getByRole('button', { name: 'Pronunciation: warming up' });
    expect(pronunciation).toHaveTextContent('Warming up');
    expect(pronunciation).not.toHaveTextContent(/[▲▼▶]/);
  });

  it('first_toggle_isolates_and_show_all_restores', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProgressScreen initialView={base} />);
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
    expect(container.querySelectorAll('[data-series]')).toHaveLength(6);

    await user.click(screen.getByRole('button', { name: 'Grammar: 68, improving' }));

    expect(container.querySelectorAll('[data-series]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Grammar: 68, improving' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fluency: 71, steady' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(container.querySelectorAll('[data-series]')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('range_selector_changes_the_plotted_points', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProgressScreen initialView={base} />);
    expect(markers(container)).toBe(21);

    await user.click(screen.getByRole('radio', { name: '30 days' }));

    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked();
    // On or after 29 Aug: Grammar 3, Vocabulary, Fluency, Interaction, Comprehension and Pronunciation 2 each.
    expect(markers(container)).toBe(13);
    expect(screen.getByRole('group', { name: 'Line chart of your competency scores, last 30 days, 13 measurements.' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '90 days' }));
    expect(markers(container)).toBe(21);
  });

  it('fewer_than_three_measurements_shows_the_explanatory_empty_state', () => {
    const { container } = render(<ProgressScreen initialView={viewWith({ competencyHistory: { chartable: false } })} />);

    expect(screen.getByText('Not enough data yet — complete 3 lessons to see trends.')).toBeInTheDocument();
    expect(container.querySelector('svg [data-series]')).toBeNull();
    expect(screen.queryByRole('group', { name: /^Line chart/ })).toBeNull();
    // The legend still shows the snapshot.
    expect(screen.getByRole('button', { name: 'Grammar: 68, improving' })).toBeInTheDocument();
  });

  it('an_empty_range_shows_its_own_message', async () => {
    const user = userEvent.setup();
    const ranges = base.competencyHistory.ranges.map((boundary) =>
      boundary.range === '30d' ? { ...boundary, since: '2026-09-28T09:00:00.000Z' } : boundary,
    );
    render(<ProgressScreen initialView={viewWith({ competencyHistory: { ranges } })} />);

    await user.click(screen.getByRole('radio', { name: '30 days' }));

    expect(screen.getByText('No measurements in the last 30 days.')).toBeInTheDocument();
    expect(screen.getByText('Choose a longer range to see earlier ones.')).toBeInTheDocument();
  });

  it('hiding_every_line_shows_the_hint', async () => {
    const user = userEvent.setup();
    render(<ProgressScreen initialView={base} />);
    const grammar = screen.getByRole('button', { name: 'Grammar: 68, improving' });

    await user.click(grammar);
    await user.click(grammar);

    expect(screen.getByText('Every line is hidden. Choose a competency below, or show all.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.queryByText(/Every line is hidden/)).toBeNull();
  });

  it('renders_recurring_weaknesses_and_opens_the_detail', async () => {
    const user = userEvent.setup();
    fetchLedgerEntry.mockResolvedValue(detail());
    render(<ProgressScreen initialView={base} />);

    const rows = screen.getAllByRole('button', { name: /last seen/ });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Third conditional: 6 times, last seen 4 days ago, Practicing, Rising',
      'Phrasal verbs: 3 times, last seen 4 days ago, New, Steady',
    ]);
    expect(rows[0]).toHaveTextContent('Practicing');
    expect(rows[0]).toHaveTextContent('▲ Rising');

    await user.click(rows[0]!);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(fetchLedgerEntry).toHaveBeenCalledWith('2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60');

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(rows[0]).toHaveFocus();
  });

  it('renders_the_partial_update_note', () => {
    const note = 'Only Pronunciation was updated from your latest lesson.';
    render(<ProgressScreen initialView={viewWith({ profile: { notes: [note] } })} />);

    const noteCard = screen.getByRole('note');
    expect(noteCard).toHaveTextContent(note);
    const chart = screen.getByRole('heading', { name: 'Competencies over time' });
    expect(noteCard.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an_empty_profile_shows_the_empty_state_with_open_classroom', () => {
    render(<ProgressScreen initialView={viewWith({ profile: { empty: true, recurringWeaknesses: [] } })} />);

    expect(screen.getByText('No progress yet.')).toBeInTheDocument();
    expect(screen.getByText('Your progress appears after your first analysed lesson.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open classroom' })).toHaveAttribute('href', '/classroom');
    expect(screen.queryByRole('heading', { name: 'Competencies over time' })).toBeNull();
  });

  it('a_failed_load_shows_the_error_with_retry', async () => {
    const user = userEvent.setup();
    fetchProgress.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(base);
    render(<ProgressScreen initialView={null} />);

    expect(await screen.findByText('Your progress could not be loaded.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Competencies over time' })).toBeInTheDocument();
    expect(fetchProgress).toHaveBeenCalledTimes(2);
  });

  it('has_no_recent_improvements_region_in_core', () => {
    render(<ProgressScreen initialView={base} />);

    expect(screen.queryByText(/recent improvements/i)).toBeNull();
  });
});
