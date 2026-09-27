import type { CurrentPlanView, PlanActivityView, PlanSessionView, StudyPlanView } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodaySessionCard } from '@/components/dashboard/today-session-card';
import type { ServerRead } from '@/lib/plans-server';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const retryPlan = vi.fn();
vi.mock('@/lib/plans', () => ({
  retryPlan: (...args: unknown[]) => retryPlan(...args),
}));

function activity(overrides: Partial<PlanActivityView> = {}): PlanActivityView {
  return {
    id: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
    day: 1,
    position: 1,
    kind: 'listening',
    contentItemId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d22',
    title: 'Listen: Ordering coffee',
    estimatedMinutes: 6,
    targetTags: [],
    rationale: 'Because listening is due.',
    isReview: false,
    carriedOver: false,
    state: 'pending',
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    skipReason: null,
    rating: null,
    notUseful: false,
    ...overrides,
  };
}

function session(day: number, overrides: Partial<PlanSessionView> = {}): PlanSessionView {
  return {
    day,
    estimatedMinutes: 17,
    state: 'not_started',
    completedAt: null,
    summary: { completed: 0, skipped: 0, correct: null, questions: null, timeSpentSeconds: null },
    activities: [activity({ day })],
    ...overrides,
  };
}

function plan(sessions: PlanSessionView[], overrides: Partial<StudyPlanView> = {}): StudyPlanView {
  return {
    id: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d23',
    status: 'active',
    origin: 'lesson',
    lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d24',
    lessonDate: '2026-09-20T10:00:00.000Z',
    createdAt: '2026-09-20T10:00:00.000Z',
    activatedAt: '2026-09-20T10:00:00.000Z',
    archivedAt: null,
    summaryLine: '7 sessions · 21 activities',
    focusTags: [],
    notes: [],
    progress: { total: 21, completed: 0, skipped: 0, inProgress: 0, pending: 21, completionPercent: 0 },
    ratings: { tooEasy: 0, justRight: 0, tooHard: 0, notUseful: 0 },
    sessions,
    ...overrides,
  };
}

function sevenSessions(overrides: (day: number) => Partial<PlanSessionView> = () => ({})): PlanSessionView[] {
  return Array.from({ length: 7 }, (_, i) => session(i + 1, overrides(i + 1)));
}

function current(overrides: Partial<CurrentPlanView> = {}): ServerRead<CurrentPlanView> {
  return {
    ok: true,
    data: { serverTime: '2026-09-25T14:00:00.000Z', plan: null, preparing: null, failure: null, ...overrides },
  };
}

beforeEach(() => {
  refresh.mockReset();
  retryPlan.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TodaySessionCard', () => {
  it('invites_opening_the_classroom_when_there_is_no_plan_yet', () => {
    render(<TodaySessionCard current={current()} />);

    expect(screen.getByText('Your study plan appears after your first lesson.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open classroom' })).toHaveAttribute('href', '/classroom');
  });

  it('shows_preparing_progress', () => {
    render(
      <TodaySessionCard
        current={current({ preparing: { lessonId: 'l1', origin: 'lesson', since: '2026-09-25T13:00:00.000Z', progress: { done: 4, total: 12 } } })}
      />,
    );

    expect(screen.getByText('Preparing your plan…')).toBeInTheDocument();
    expect(screen.getByText('4 of 12')).toBeInTheDocument();
  });

  it('shows_the_failure_message_and_retries_it', async () => {
    const user = userEvent.setup();
    retryPlan.mockResolvedValueOnce(undefined);
    render(
      <TodaySessionCard
        current={current({
          failure: { lessonId: 'l1', origin: 'lesson', failedAt: '2026-09-25T13:00:00.000Z', message: 'We could not build a new plan. Your previous plan is still available.', retryable: true },
        })}
      />,
    );

    expect(screen.getByText(/We could not build a new plan/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryPlan).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('lists_the_current_sessions_activities_with_a_start_session_link_when_routable', () => {
    const sessions = sevenSessions();
    sessions[2] = session(3, { state: 'in_progress', activities: [activity({ day: 3, title: 'Read: A missed train', kind: 'reading' })] });
    render(<TodaySessionCard current={current({ plan: plan(sessions) })} />);

    expect(screen.getByText('Day 3 · 17 min')).toBeInTheDocument();
    expect(screen.getByText('Read: A missed train')).toBeInTheDocument();
    // ACTIVITY_ROUTES is empty until F16-F18 register a kind, so no runner exists yet.
    expect(screen.queryByRole('link', { name: 'Start session' })).toBeNull();
    expect(screen.getByRole('link', { name: 'See the full plan' })).toHaveAttribute('href', '/plan');
  });

  it('shows_the_completed_today_summary_with_a_work_ahead_link', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 25, 14, 0, 0), toFake: ['Date'] });
    const sessions = sevenSessions();
    sessions[0] = session(1, {
      state: 'completed',
      completedAt: new Date(2026, 8, 25, 8, 0, 0).toISOString(),
      summary: { completed: 3, skipped: 0, correct: 8, questions: 10, timeSpentSeconds: 1080 },
    });
    render(<TodaySessionCard current={current({ plan: plan(sessions, { progress: { total: 21, completed: 3, skipped: 0, inProgress: 0, pending: 18, completionPercent: 14 } }) })} />);

    expect(screen.getByText(/3 activities completed/)).toBeInTheDocument();
    expect(screen.getByText(/8 of 10 correct/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Work ahead in Plan' })).toHaveAttribute('href', '/plan');
  });

  it('reports_a_finished_plan', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 25, 14, 0, 0), toFake: ['Date'] });
    const done = new Date(2026, 8, 1, 8, 0, 0).toISOString();
    const sessions = sevenSessions(() => ({ state: 'completed', completedAt: done }));
    render(<TodaySessionCard current={current({ plan: plan(sessions) })} />);

    expect(screen.getByText('You have completed every session in this plan.')).toBeInTheDocument();
  });

  it('renders_an_error_state_when_the_read_fails', () => {
    render(<TodaySessionCard current={{ ok: false, status: 500, code: null }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your plan.');
  });
});
