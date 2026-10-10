import type { PlanActivityView, PlanSessionView } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { sessionBlock } from '../../src/activities/objective/session-context';

const entry = (id: string, position: number, kind: PlanActivityView['kind'] = 'reading'): PlanActivityView => ({
  id,
  day: 3,
  position,
  kind,
  contentItemId: kind === 'writing' ? null : '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  title: `Activity ${position}`,
  estimatedMinutes: 7,
  targetTags: [],
  rationale: 'Because.',
  isReview: false,
  carriedOver: false,
  state: 'pending',
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  skipReason: null,
  rating: null,
  notUseful: false,
});

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const session: PlanSessionView = {
  day: 3,
  estimatedMinutes: 21,
  state: 'not_started',
  completedAt: null,
  summary: { completed: 0, skipped: 0, correct: null, questions: null, timeSpentSeconds: null },
  activities: [entry(A, 1), entry(B, 2, 'grammar'), entry(C, 3, 'writing')],
};

describe('session context', () => {
  it('takes_the_current_day_from_the_plan_view', () => {
    expect(sessionBlock(session, B).day).toBe(3);
  });

  it('reports_the_current_position_and_count', () => {
    expect(sessionBlock(session, B)).toMatchObject({ position: 2, count: 3 });
    expect(sessionBlock(session, B).activities).toBe(session.activities);
  });

  it('a_carried_copy_is_found_by_its_resolved_id', () => {
    const carried: PlanSessionView = { ...session, activities: [entry(A, 1), { ...entry(C, 2), carriedOver: true }] };
    expect(sessionBlock(carried, C)).toMatchObject({ position: 2, count: 2 });
    expect(() => sessionBlock(carried, B)).toThrow(/not part of day 3/);
  });
});
