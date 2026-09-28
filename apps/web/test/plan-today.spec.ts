import type { PlanSessionView, StudyPlanView } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { selectTodaySession } from '@/lib/plan-today';

function session(day: number, overrides: Partial<PlanSessionView> = {}): PlanSessionView {
  return {
    day,
    estimatedMinutes: 17,
    state: 'not_started',
    completedAt: null,
    summary: { completed: 0, skipped: 0, correct: null, questions: null, timeSpentSeconds: null },
    activities: [],
    ...overrides,
  };
}

function plan(sessions: PlanSessionView[]): StudyPlanView {
  return {
    id: 'plan-1',
    status: 'active',
    origin: 'lesson',
    lessonId: 'lesson-1',
    lessonDate: '2026-09-20T10:00:00.000Z',
    createdAt: '2026-09-20T10:00:00.000Z',
    activatedAt: '2026-09-20T10:00:00.000Z',
    archivedAt: null,
    summaryLine: '7 sessions · 0 activities',
    focusTags: [],
    notes: [],
    progress: { total: 0, completed: 0, skipped: 0, inProgress: 0, pending: 0, completionPercent: 0 },
    ratings: { tooEasy: 0, justRight: 0, tooHard: 0, notUseful: 0 },
    sessions,
  };
}

/**
 * The shared case table: `apps/mobile/test/features/plan/plan_today_test.dart`
 * pins the same rows, so the two clients pick the same session for `Today`.
 * Built from local date parts, so it holds in any timezone.
 */
const NOW = new Date(2026, 8, 25, 14, 0, 0);

describe('selectTodaySession', () => {
  it('an_in_progress_session_wins_over_everything_else', () => {
    const p = plan([
      session(1, { state: 'completed', completedAt: NOW.toISOString() }),
      session(2, { state: 'in_progress' }),
      session(3, { state: 'not_started' }),
    ]);
    const result = selectTodaySession(p, NOW);
    expect(result.mode).toBe('in_progress');
    expect(result.session?.day).toBe(2);
  });

  it('a_session_completed_today_stays_until_the_day_turns', () => {
    const completedToday = new Date(2026, 8, 25, 8, 0, 0).toISOString();
    const p = plan([session(1, { state: 'completed', completedAt: completedToday }), session(2, { state: 'not_started' })]);
    const result = selectTodaySession(p, NOW);
    expect(result.mode).toBe('completed_today');
    expect(result.session?.day).toBe(1);
  });

  it('picks_the_latest_of_several_sessions_completed_today', () => {
    const morning = new Date(2026, 8, 25, 8, 0, 0).toISOString();
    const noon = new Date(2026, 8, 25, 12, 0, 0).toISOString();
    const p = plan([
      session(1, { state: 'completed', completedAt: morning }),
      session(2, { state: 'completed', completedAt: noon }),
      session(3, { state: 'not_started' }),
    ]);
    const result = selectTodaySession(p, NOW);
    expect(result.session?.day).toBe(2);
  });

  it('a_session_completed_yesterday_does_not_count_as_today', () => {
    const yesterday = new Date(2026, 8, 24, 20, 0, 0).toISOString();
    const p = plan([session(1, { state: 'completed', completedAt: yesterday }), session(2, { state: 'not_started' })]);
    const result = selectTodaySession(p, NOW);
    expect(result.mode).toBe('next');
    expect(result.session?.day).toBe(2);
  });

  it('the_next_untouched_session_follows_a_gap_without_skipping_ahead', () => {
    const longAgo = new Date(2026, 8, 1, 8, 0, 0).toISOString();
    const p = plan([
      session(1, { state: 'completed', completedAt: longAgo }),
      session(2, { state: 'not_started' }),
      session(3, { state: 'not_started' }),
    ]);
    const result = selectTodaySession(p, NOW);
    expect(result.mode).toBe('next');
    expect(result.session?.day).toBe(2);
  });

  it('a_finished_plan_reports_plan_complete', () => {
    const done = new Date(2026, 8, 1, 8, 0, 0).toISOString();
    const p = plan(Array.from({ length: 7 }, (_, i) => session(i + 1, { state: 'completed', completedAt: done })));
    const result = selectTodaySession(p, NOW);
    expect(result.mode).toBe('plan_complete');
    expect(result.session).toBeNull();
  });

  it('uses_the_devices_local_date_not_utc', () => {
    // 23:30 local on the 25th is still "today" locally even though its ISO
    // string's UTC date component can already read the 26th in some zones.
    const lateTonight = new Date(2026, 8, 25, 23, 30, 0);
    const p = plan([session(1, { state: 'completed', completedAt: lateTonight.toISOString() }), session(2, { state: 'not_started' })]);
    const result = selectTodaySession(p, lateTonight);
    expect(result.mode).toBe('completed_today');
  });
});
