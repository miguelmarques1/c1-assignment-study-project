import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedLesson, seedSpeaker, type Speaker } from './helpers/pipeline-fixtures';
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

function get(path: string, speaker?: Speaker) {
  const call = request(ctx.app.getHttpServer()).get(path);
  return speaker ? call.set('Cookie', speaker.cookie) : call;
}

function post(path: string, speaker?: Speaker) {
  const call = request(ctx.app.getHttpServer()).post(path);
  return speaker ? call.set('Cookie', speaker.cookie) : call;
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
      focusTags: [],
      rulesVersion: '1',
      rulesFingerprint: 'f'.repeat(64),
      taxonomyVersion: '1',
      createdAt: now,
      activatedAt: status === 'active' ? now : null,
      archivedAt: status === 'archived' ? now : null,
    },
  });
}

async function seedActivity(planId: string, userId: string, overrides: { day?: number; position?: number } = {}) {
  return ctx.prisma.studyPlanActivity.create({
    data: {
      planId,
      userId,
      day: overrides.day ?? 1,
      position: overrides.position ?? 1,
      kind: 'writing',
      contentItemId: null,
      title: 'Writing task',
      targetTags: [],
      estimatedMinutes: 15,
      rationale: 'General C1 practice while your profile builds up.',
      rationaleSource: 'template',
      placement: 'task',
      state: 'pending',
    },
  });
}

describe('plan routes', () => {
  it('current_is_empty_for_a_fresh_user', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const response = await get('/plans/current', ana).expect(200);
    expect(response.body.data.plan).toBeNull();
    expect(response.body.data.preparing).toBeNull();
    expect(response.body.data.failure).toBeNull();
  });

  it('current_reports_the_active_plan_with_its_sessions_and_progress', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const lessonId = await seedLesson(ctx, [ana.id], new Date());
    const plan = await seedPlan(ana.id, lessonId);
    await seedActivity(plan.id, ana.id, { day: 1, position: 1 });
    await seedActivity(plan.id, ana.id, { day: 1, position: 2 });

    const response = await get('/plans/current', ana).expect(200);
    expect(response.body.data.plan.id).toBe(plan.id);
    expect(response.body.data.plan.sessions).toHaveLength(7);
    expect(response.body.data.plan.sessions[0].activities).toHaveLength(2);
    expect(response.body.data.plan.progress).toMatchObject({ total: 2, completed: 0, completionPercent: 0 });
  });

  it('history_lists_active_and_archived_plans_newest_first', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const lessonId1 = await seedLesson(ctx, [ana.id], new Date('2026-01-01'));
    const lessonId2 = await seedLesson(ctx, [ana.id], new Date('2026-01-08'));
    await seedPlan(ana.id, lessonId1, 'archived');
    const active = await seedPlan(ana.id, lessonId2, 'active');

    const response = await get('/plans', ana).expect(200);
    expect(response.body.data.plans).toHaveLength(2);
    expect(response.body.data.plans[0].id).toBe(active.id);
  });

  it('detail_returns_plan001_for_an_unknown_or_foreign_plan', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const ben = await seedSpeaker(ctx, 'Ben');
    const lessonId = await seedLesson(ctx, [ben.id], new Date());
    const bensPlan = await seedPlan(ben.id, lessonId);

    await get(`/plans/${bensPlan.id}`, ana).expect(404).expect((res) => expect(res.body.error.code).toBe('PLAN001'));
    await get('/plans/00000000-0000-0000-0000-000000000000', ana)
      .expect(404)
      .expect((res) => expect(res.body.error.code).toBe('PLAN001'));
  });

  it('detail_returns_the_owners_own_plan', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const lessonId = await seedLesson(ctx, [ana.id], new Date());
    const plan = await seedPlan(ana.id, lessonId);
    await seedActivity(plan.id, ana.id);

    const response = await get(`/plans/${plan.id}`, ana).expect(200);
    expect(response.body.data.id).toBe(plan.id);
  });

  it('no_response_carries_another_participants_plan_data', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const ben = await seedSpeaker(ctx, 'Ben');
    const lessonId = await seedLesson(ctx, [ben.id], new Date());
    const bensPlan = await seedPlan(ben.id, lessonId);
    await seedActivity(bensPlan.id, ben.id);

    const current = await get('/plans/current', ana).expect(200);
    expect(current.body.data.plan).toBeNull();

    const history = await get('/plans', ana).expect(200);
    expect(history.body.data.plans).toHaveLength(0);
  });

  it('retry_without_a_failure_is_rejected', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    await post('/plans/retry', ana).expect(409).expect((res) => expect(res.body.error.code).toBe('PLAN002'));
  });

  it('retry_resets_a_failed_request_and_reports_preparing', async () => {
    const ana = await seedSpeaker(ctx, 'Ana');
    const lessonId = await seedLesson(ctx, [ana.id], new Date());
    await ctx.prisma.studyPlanRequest.create({
      data: { userId: ana.id, lessonId, origin: 'recording_failed', status: 'failed', attempts: 3, failureReason: 'x', finishedAt: new Date() },
    });

    const before = await get('/plans/current', ana).expect(200);
    expect(before.body.data.failure.origin).toBe('recording_failed');

    const after = await post('/plans/retry', ana).expect(200);
    expect(after.body.data.preparing).not.toBeNull();
    expect(after.body.data.failure).toBeNull();

    const request_ = await ctx.prisma.studyPlanRequest.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId, origin: 'recording_failed' } },
    });
    expect(request_.status).toBe('pending');
    expect(request_.attempts).toBe(0);
  });

  it('every_protected_route_requires_a_session', async () => {
    await get('/plans/current').expect(401);
    await get('/plans').expect(401);
    await post('/plans/retry').expect(401);
  });
});
