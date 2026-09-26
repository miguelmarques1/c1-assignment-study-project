import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentLessons } from '@/components/dashboard/recent-lessons';
import { LessonList } from '@/components/lessons/lesson-list';
import LessonsLoading from '@/app/(app)/lessons/loading';
import { AreaError } from '@/components/lessons/area-error';

import { lessonList, ok, summary } from './fixtures/lessons';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => '/lessons',
}));

const apiFetch = vi.fn();
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
  apiFetch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('lesson list', () => {
  it('renders_each_row_with_date_duration_participants_domain_and_status', () => {
    vi.useFakeTimers({ now: new Date('2026-09-25T15:00:00.000Z'), toFake: ['Date'] });
    render(<LessonList initial={lessonList([summary()])} />);

    const row = screen.getByRole('link');
    expect(row).toHaveAttribute('href', '/lessons/9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21');
    expect(within(row).getByText(/Yesterday|hours ago/)).toBeInTheDocument();
    expect(row).toHaveTextContent('53 min');
    expect(within(row).getByText('You, Ana')).toBeInTheDocument();
    expect(within(row).getByText('travel')).toBeInTheDocument();
    expect(within(row).getByText('Ready')).toBeInTheDocument();
    expect(within(row).getByText('The missed connection')).toBeInTheDocument();
    expect(screen.getByText('Recordings use 12.4 MB of storage.')).toBeInTheDocument();
  });

  it('every_status_and_flag_renders_a_distinct_label', () => {
    const lessons = [
      summary({ lessonId: '00000000-0000-4000-8000-000000000001', status: 'processing', activeStage: 'transcription', headline: null, flags: ['partial'] }),
      summary({ lessonId: '00000000-0000-4000-8000-000000000002', status: 'ready' }),
      summary({ lessonId: '00000000-0000-4000-8000-000000000003', status: 'blocked', statusReason: 'Blocked.', headline: null, flags: ['no_scenario'] }),
      summary({ lessonId: '00000000-0000-4000-8000-000000000004', status: 'failed', statusReason: 'Failed.', headline: null, flags: ['ended_unexpectedly'] }),
      summary({ lessonId: '00000000-0000-4000-8000-000000000005', status: 'too_short', statusReason: 'Short.', headline: null }),
      summary({ lessonId: '00000000-0000-4000-8000-000000000006', status: 'recording_failed', statusReason: 'Not recorded.', headline: null }),
    ];
    const { container } = render(<LessonList initial={lessonList(lessons)} />);

    const labels = ['Processing', 'Ready', 'Blocked', 'Failed', 'Too short', 'Recording failed', 'Partial', 'No scenario', 'Ended unexpectedly'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(new Set(labels).size).toBe(9);
    // Statuses are badges (uppercase pills), flags are chips beside them.
    for (const status of labels.slice(0, 6)) {
      expect(screen.getByText(status)).toHaveClass('uppercase');
    }
    for (const flag of labels.slice(6)) {
      expect(screen.getByText(flag)).not.toHaveClass('uppercase');
    }
    expect(container.querySelectorAll('li')).toHaveLength(6);
  });

  it('processing_blocked_and_ready_rows_show_their_line', () => {
    render(
      <LessonList
        initial={lessonList([
          summary({ lessonId: '00000000-0000-4000-8000-000000000001', status: 'processing', activeStage: 'transcription', headline: null }),
          summary({
            lessonId: '00000000-0000-4000-8000-000000000002',
            status: 'blocked',
            activeStage: 'transcription',
            statusReason: 'Blocked — add your Azure Speech key to continue.',
            headline: null,
          }),
          summary({ lessonId: '00000000-0000-4000-8000-000000000003' }),
        ])}
      />,
    );
    expect(screen.getByText('Transcribing')).toBeInTheDocument();
    expect(screen.getByText('Blocked — add your Azure Speech key to continue.')).toBeInTheDocument();
    expect(screen.getByText('Grammar +4 · Pronunciation −2')).toBeInTheDocument();
  });

  it('load_more_appends_the_next_page', async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValueOnce(
      lessonList([summary({ lessonId: '00000000-0000-4000-8000-000000000009', scenarioTitle: 'Older lesson' })], { nextCursor: null }),
    );
    render(<LessonList initial={lessonList([summary()], { nextCursor: 'abc_DEF-1' })} />);

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(apiFetch).toHaveBeenCalledWith('/lessons?cursor=abc_DEF-1');
    expect(await screen.findByText('Older lesson')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('auto_refresh_runs_only_while_something_is_pending', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <LessonList initial={lessonList([summary({ status: 'processing', activeStage: 'lesson_analysis', headline: null })])} />,
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(refresh).toHaveBeenCalledTimes(3);
    unmount();

    refresh.mockReset();
    render(<LessonList initial={lessonList([summary()])} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('lesson_pages_render_loading_empty_and_error_states', async () => {
    const user = userEvent.setup();
    const { container } = render(<LessonsLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your lessons');
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    cleanup();

    render(<LessonList initial={lessonList([], { totalStorageBytes: 0 })} />);
    expect(screen.getByText('No lessons yet')).toBeInTheDocument();
    expect(screen.getByText('A lesson appears here as soon as it ends.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open classroom' }));
    expect(push).toHaveBeenCalledWith('/classroom');
    cleanup();

    render(<AreaError title="We could not load your lessons." />);
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your lessons.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('the_dashboard_shows_the_three_newest_lessons', () => {
    const lessons = [1, 2, 3, 4, 5].map((n) =>
      summary({ lessonId: `00000000-0000-4000-8000-00000000000${n}`, scenarioTitle: `Lesson ${n}` }),
    );
    render(<RecentLessons result={ok(lessonList(lessons))} />);

    const list = screen.getByRole('list', { name: 'Recent lessons' });
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    expect(within(list).getByText('Lesson 1')).toBeInTheDocument();
    expect(within(list).queryByText('Lesson 4')).toBeNull();
    expect(screen.getByRole('link', { name: /See all lessons/ })).toHaveAttribute('href', '/lessons');
    cleanup();

    render(<RecentLessons result={ok(lessonList([]))} />);
    expect(screen.getByText('No lessons yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /See all lessons/ })).toBeNull();
  });
});
