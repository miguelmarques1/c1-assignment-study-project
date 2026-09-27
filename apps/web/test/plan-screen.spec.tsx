import type { CurrentPlanView, PlanHistoryItem, PlanHistoryView, PlanActivityView, PlanSessionView, StudyPlanView } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanScreen } from '@/components/plan/plan-screen';
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
    targetTags: [{ tag: 'grammar:present_perfect', label: 'Present perfect' }],
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
    activities: [activity({ day, id: `activity-${day}` })],
    ...overrides,
  };
}

function sevenSessions(overrides: (day: number) => Partial<PlanSessionView> = () => ({})): PlanSessionView[] {
  return Array.from({ length: 7 }, (_, i) => session(i + 1, overrides(i + 1)));
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

function current(overrides: Partial<CurrentPlanView> = {}): ServerRead<CurrentPlanView> {
  return {
    ok: true,
    data: { serverTime: '2026-09-25T14:00:00.000Z', plan: null, preparing: null, failure: null, ...overrides },
  };
}

function historyItem(overrides: Partial<PlanHistoryItem> = {}): PlanHistoryItem {
  return {
    id: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d25',
    status: 'archived',
    origin: 'lesson',
    lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d26',
    lessonDate: '2026-09-10T10:00:00.000Z',
    createdAt: '2026-09-10T10:00:00.000Z',
    activatedAt: '2026-09-10T10:00:00.000Z',
    archivedAt: '2026-09-18T10:00:00.000Z',
    summaryLine: '7 sessions · 19 activities',
    activityCount: 19,
    completedCount: 12,
    skippedCount: 1,
    completionPercent: 63,
    ratings: { tooEasy: 1, justRight: 2, tooHard: 0, notUseful: 0 },
    ...overrides,
  };
}

function historyOf(plans: PlanHistoryItem[]): ServerRead<PlanHistoryView> {
  return { ok: true, data: { plans } };
}

const NO_HISTORY = historyOf([]);

beforeEach(() => {
  refresh.mockReset();
  retryPlan.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PlanScreen', () => {
  it('shows_the_empty_state_when_there_is_no_plan_yet', () => {
    render(<PlanScreen current={current()} history={NO_HISTORY} />);

    expect(screen.getByText('No plan yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open classroom' })).toHaveAttribute('href', '/classroom');
  });

  it('shows_the_status_banner_for_a_preparing_build', () => {
    render(
      <PlanScreen
        current={current({ preparing: { lessonId: 'l1', origin: 'lesson', since: '2026-09-25T13:00:00.000Z', progress: { done: 4, total: 12 } } })}
        history={NO_HISTORY}
      />,
    );

    expect(screen.getByText('Preparing your plan…')).toBeInTheDocument();
    expect(screen.getByText('4 of 12')).toBeInTheDocument();
  });

  it('shows_the_failure_banner_and_retries_it', async () => {
    const user = userEvent.setup();
    retryPlan.mockResolvedValueOnce(undefined);
    render(
      <PlanScreen
        current={current({
          failure: { lessonId: 'l1', origin: 'lesson', failedAt: '2026-09-25T13:00:00.000Z', message: 'We could not build a new plan.', retryable: true },
        })}
        history={NO_HISTORY}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryPlan).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders_the_summary_notes_and_all_seven_days', () => {
    const sessions = sevenSessions();
    sessions[1] = session(2, { activities: [activity({ day: 2, id: 'carried', carriedOver: true })] });
    const withNotesAndCarry = plan(sessions, {
      notes: [{ code: 'general_material', text: 'Built from general C1 material because this is your first lesson.' }],
      progress: { total: 7, completed: 0, skipped: 0, inProgress: 0, pending: 7, completionPercent: 0 },
    });
    render(<PlanScreen current={current({ plan: withNotesAndCarry })} history={NO_HISTORY} />);

    expect(screen.getByText('7 sessions · 21 activities')).toBeInTheDocument();
    expect(screen.getByText('Built from general C1 material because this is your first lesson.')).toBeInTheDocument();
    expect(screen.getByText('1 carried over from your previous plan')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toBeInTheDocument();
    for (let day = 1; day <= 7; day += 1) {
      expect(screen.getByText(new RegExp(`^Day ${day} ·`))).toBeInTheDocument();
    }
  });

  it('expands_todays_day_by_default_and_others_stay_collapsed', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 25, 14, 0, 0), toFake: ['Date'] });
    const sessions = sevenSessions();
    sessions[2] = session(3, { state: 'in_progress' });
    render(<PlanScreen current={current({ plan: plan(sessions) })} history={NO_HISTORY} />);

    const buttons = screen.getAllByRole('button', { name: /^Day \d/ });
    expect(buttons[2]).toHaveAttribute('aria-expanded', 'true');
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(buttons[6]).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists_previous_plans_marking_the_active_one_current', () => {
    const activePlan = historyItem({ id: 'active-plan', status: 'active', completedCount: 8, activityCount: 20, completionPercent: 40 });
    const archivedPlan = historyItem({ id: 'archived-plan' });
    render(<PlanScreen current={current()} history={historyOf([activePlan, archivedPlan])} />);

    expect(screen.getByRole('link', { name: /12 of 19 completed/ })).toHaveAttribute('href', '/plan/archived-plan');
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('shows_an_area_error_when_the_current_read_fails', () => {
    render(<PlanScreen current={{ ok: false, status: 500, code: null }} history={NO_HISTORY} />);

    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your plan.');
  });
});
