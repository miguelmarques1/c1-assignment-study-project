import type { PlanActivityKind } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { activityHref } from '@/lib/activity-routes';
import { nextStep } from '@/lib/activity-navigation';
import { ACTIVITY_ID, OTHER_ACTIVITY_ID, planEntry, viewOf } from './fixtures/activities';

describe('activity routes', () => {
  it('the_five_bank_kinds_are_registered_for_the_objective_runner', () => {
    const kinds: PlanActivityKind[] = ['listening', 'reading', 'vocabulary', 'grammar', 'error_review'];
    for (const kind of kinds) {
      expect(activityHref(planEntry({ id: ACTIVITY_ID, kind }))).toBe(`/activities/${ACTIVITY_ID}`);
    }
  });

  it('the_task_kinds_keep_their_own_runners', () => {
    expect(activityHref(planEntry({ kind: 'writing' }))).toBe(`/plan/activities/${ACTIVITY_ID}/writing`);
    expect(activityHref(planEntry({ kind: 'speaking' }))).toBe(`/speaking/${ACTIVITY_ID}`);
  });
});

describe('nextStep', () => {
  it('next_is_the_first_unfinished_other_activity', () => {
    const view = viewOf({
      session: [
        planEntry({ id: ACTIVITY_ID, position: 1, state: 'completed' }),
        planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'grammar', state: 'pending' }),
        planEntry({ id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', position: 3, kind: 'writing', state: 'pending' }),
      ],
    });
    expect(nextStep(view)).toMatchObject({ kind: 'next', href: `/activities/${OTHER_ACTIVITY_ID}` });
  });

  it('an_in_progress_activity_counts_as_unfinished', () => {
    const view = viewOf({
      session: [planEntry({ id: ACTIVITY_ID, position: 1 }), planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'speaking', state: 'in_progress' })],
    });
    expect(nextStep(view)).toMatchObject({ kind: 'next', href: `/speaking/${OTHER_ACTIVITY_ID}` });
  });

  it('a_finished_session_leads_back_to_today', () => {
    const view = viewOf({
      session: [
        planEntry({ id: ACTIVITY_ID, position: 1, state: 'completed' }),
        planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'grammar', state: 'skipped' }),
      ],
    });
    expect(nextStep(view)).toEqual({ kind: 'today', href: '/dashboard' });
  });

  it('an_unroutable_next_activity_leads_back_to_today', () => {
    // Every kind has a runner today, so an unknown one stands in for a kind nobody has registered yet.
    const view = viewOf({
      session: [planEntry({ id: ACTIVITY_ID, position: 1 }), planEntry({ id: OTHER_ACTIVITY_ID, position: 2, kind: 'future_kind' as PlanActivityKind })],
    });
    expect(nextStep(view)).toEqual({ kind: 'today', href: '/dashboard' });
  });
});
