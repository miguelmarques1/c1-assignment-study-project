import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppError } from '../../src/common/app-error';
import { PlanActivityStateService } from '../../src/plans/plan-activity-state.service';
import { PlanHistoryReader } from '../../src/plans/plan-history.reader';
import { seedLesson, seedUser } from './helpers/pipeline-fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.lesson.deleteMany();
  await ctx.prisma.user.deleteMany();
});

function service(): PlanActivityStateService {
  return ctx.app.get(PlanActivityStateService);
}

function history(): PlanHistoryReader {
  return ctx.app.get(PlanHistoryReader);
}

async function seedPlan(userId: string, lessonId: string, status: 'active' | 'archived' = 'active') {
  const now = new Date();
  return ctx.prisma.studyPlan.create({
    data: {
      userId,
      lessonId,
      origin: 'lesson',
      status,
      precedenceAt: now,
      composition: 'deterministic',
      deterministicReason: 'no_profile',
      generalMaterial: true,
      rulesVersion: '1',
      rulesFingerprint: 'f'.repeat(64),
      taxonomyVersion: '1',
      createdAt: now,
      activatedAt: status === 'active' ? now : null,
      archivedAt: status === 'archived' ? now : null,
    },
  });
}

async function seedActivity(
  planId: string,
  userId: string,
  overrides: { day?: number; position?: number; kind?: 'writing' | 'speaking' | 'pronunciation'; state?: string; carriedFromActivityId?: string } = {},
) {
  const state = overrides.state ?? 'pending';
  const now = new Date();
  return ctx.prisma.studyPlanActivity.create({
    data: {
      planId,
      userId,
      day: overrides.day ?? 1,
      position: overrides.position ?? 1,
      kind: overrides.kind ?? 'writing',
      contentItemId: null,
      title: 'Writing task',
      targetTags: [],
      estimatedMinutes: 15,
      rationale: 'General C1 practice while your profile builds up.',
      rationaleSource: 'template',
      placement: 'task',
      state,
      // Every non-pending, non-skipped state needs started_at; completed also needs completed_at (ck_plan_activities_states).
      startedAt: state === 'pending' ? null : now,
      completedAt: state === 'completed' ? now : null,
      skippedAt: state === 'skipped' ? now : null,
      skipReason: state === 'skipped' ? 'test' : null,
      carriedFromActivityId: overrides.carriedFromActivityId,
    },
  });
}

describe('PlanActivityStateService', () => {
  it('resolves_an_owned_activity_with_a_single_element_lineage_when_never_carried', async () => {
    const userId = await seedUser(ctx, 'Gia');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const activity = await seedActivity(plan.id, userId);

    const resolved = await service().resolveForOwner(userId, activity.id);
    expect(resolved.lineage).toEqual([activity.id]);
    expect(resolved.activityId).toBe(activity.id);
    expect(resolved.planStatus).toBe('active');
  });

  it('resolves_forward_to_the_newest_carried_copy', async () => {
    const userId = await seedUser(ctx, 'Hana');
    const lessonId1 = await seedLesson(ctx, [userId], new Date('2026-01-01'));
    const lessonId2 = await seedLesson(ctx, [userId], new Date('2026-01-08'));
    const oldPlan = await seedPlan(userId, lessonId1, 'archived');
    const original = await seedActivity(oldPlan.id, userId, { state: 'in_progress' });
    const newPlan = await seedPlan(userId, lessonId2, 'active');
    const carried = await seedActivity(newPlan.id, userId, { carriedFromActivityId: original.id });

    const resolved = await service().resolveForOwner(userId, original.id);
    expect(resolved.activityId).toBe(carried.id);
    expect(resolved.lineage).toEqual([original.id, carried.id]);
    expect(resolved.planStatus).toBe('active');
  });

  it('throws_plan_activity_not_found_for_an_unknown_or_foreign_id', async () => {
    const userId = await seedUser(ctx, 'Ivy');
    const other = await seedUser(ctx, 'Jan');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const activity = await seedActivity(plan.id, userId);

    await expect(service().resolveForOwner(other, activity.id)).rejects.toThrow(AppError);
    await expect(service().resolveForOwner(userId, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: 'PLAN003',
    });
  });

  it('start_then_complete_updates_session_and_plan_progress', async () => {
    const userId = await seedUser(ctx, 'Kim');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const a = await seedActivity(plan.id, userId, { day: 1, position: 1 });
    await seedActivity(plan.id, userId, { day: 1, position: 2 });

    await service().markStarted(userId, a.id, { at: new Date() });
    const started = await ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(started.state).toBe('in_progress');
    expect(started.startedAt).not.toBeNull();

    const result = await service().markCompleted(userId, a.id, { completionKey: '11111111-1111-4111-8111-111111111111', completedAt: new Date(), scoreCorrect: 4, scoreTotal: 5 });
    expect(result.state).toBe('completed');
    expect(result.sessionCompleted).toBe(false); // the sibling activity is still pending
    expect(result.planCompletionPercent).toBe(50);
  });

  it('completion_is_idempotent_per_completion_key', async () => {
    const userId = await seedUser(ctx, 'Leo');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const a = await seedActivity(plan.id, userId);

    await service().markCompleted(userId, a.id, { completionKey: '22222222-2222-4222-8222-222222222222', completedAt: new Date('2026-01-01T10:00:00Z') });
    const first = await ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.id } });

    await service().markCompleted(userId, a.id, { completionKey: '22222222-2222-4222-8222-222222222222', completedAt: new Date('2026-01-02T10:00:00Z') });
    const second = await ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(second.completedAt).toEqual(first.completedAt);
  });

  it('skip_marks_skipped_and_writes_no_ledger_entry', async () => {
    const userId = await seedUser(ctx, 'Mia');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const a = await seedActivity(plan.id, userId, { kind: 'speaking' });

    const state = await service().markSkipped(userId, a.id, { reason: 'not today', at: new Date() });
    expect(state).toBe('skipped');
    expect(await ctx.prisma.errorLedgerOccurrence.count({ where: { userId } })).toBe(0);
  });

  it('rating_requires_a_completed_activity', async () => {
    const userId = await seedUser(ctx, 'Nora');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const a = await seedActivity(plan.id, userId);

    await expect(service().recordRating(userId, a.id, { rating: 'just_right', notUseful: false })).rejects.toThrow(AppError);
    await service().markCompleted(userId, a.id, { completionKey: '33333333-3333-4333-8333-333333333333', completedAt: new Date() });
    await service().recordRating(userId, a.id, { rating: 'just_right', notUseful: false });
    const rated = await ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(rated.difficultyRating).toBe('just_right');
  });

  it('rating_is_allowed_on_an_archived_plan', async () => {
    const userId = await seedUser(ctx, 'Omar');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId, 'archived');
    const a = await seedActivity(plan.id, userId, { state: 'completed' });
    await ctx.prisma.studyPlanActivity.update({ where: { id: a.id }, data: { completedAt: new Date() } });

    await expect(service().recordRating(userId, a.id, { rating: 'too_hard', notUseful: true })).resolves.toBeUndefined();
  });

  it('a_state_change_on_a_replaced_plan_without_carry_over_is_rejected', async () => {
    const userId = await seedUser(ctx, 'Pia');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId, 'archived');
    const a = await seedActivity(plan.id, userId);

    await expect(service().markStarted(userId, a.id, { at: new Date() })).rejects.toMatchObject({ code: 'PLAN004' });
  });
});

describe('PlanHistoryReader', () => {
  it('history_reader_and_a_direct_plan_query_agree_on_completion_counts', async () => {
    const userId = await seedUser(ctx, 'Quinn');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    await seedActivity(plan.id, userId, { day: 1, position: 1, state: 'completed' });
    await seedActivity(plan.id, userId, { day: 1, position: 2, state: 'pending' });
    await ctx.prisma.studyPlanActivity.updateMany({ where: { planId: plan.id, state: 'completed' }, data: { completedAt: new Date() } });

    const items = await history().completionHistoryFor(userId);
    const item = items.find((entry) => entry.id === plan.id)!;
    expect(item.activityCount).toBe(2);
    expect(item.completedCount).toBe(1);
    expect(item.completionPercent).toBe(50);
  });

  it('completed_activities_since_returns_only_completed_rows_in_the_window', async () => {
    const userId = await seedUser(ctx, 'Rico');
    const lessonId = await seedLesson(ctx, [userId], new Date());
    const plan = await seedPlan(userId, lessonId);
    const completed = await seedActivity(plan.id, userId, { state: 'completed' });
    await ctx.prisma.studyPlanActivity.update({ where: { id: completed.id }, data: { completedAt: new Date() } });
    await seedActivity(plan.id, userId, { day: 2, state: 'pending' });

    const rows = await history().completedActivities(userId, new Date(Date.now() - 60_000));
    expect(rows.map((row) => row.activityId)).toEqual([completed.id]);
  });
});
