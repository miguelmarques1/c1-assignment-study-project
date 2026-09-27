import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanRequestJob } from '../../src/plan-generation/plan-request.job';
import { StudyPlanFallbackPort } from '../../src/recording/study-plan-fallback.port';
import {
  createPipelineTestContext,
  makeProfiledLesson,
  resetPipelineTables,
  seedLesson,
  seedUser,
  type PipelineTestContext,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  await resetPipelineTables(pipeline.ctx);
});

function job(): PlanRequestJob {
  return pipeline.ctx.app.get(PlanRequestJob);
}

describe('plan request job (F15 fallback and interim plans)', () => {
  it('a_failed_recording_produces_a_plan_from_the_existing_profile_with_the_note', async () => {
    const userId = await seedUser(pipeline.ctx, 'Ben');
    await makeProfiledLesson(pipeline.ctx, userId, {
      startedAt: new Date('2026-01-01T10:00:00Z'),
      errors: [{ tag: 'grammar:conditional-3' }],
    });
    const lessonId = await seedLesson(pipeline.ctx, [userId], new Date('2026-01-05T10:00:00Z'));
    await pipeline.ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId, userId, stage: 'recording', status: 'failed', failureCode: 'recording_missing' },
    });

    const port = pipeline.ctx.app.get(StudyPlanFallbackPort);
    await port.requestFallbackPlan({ lessonId, userId, failureCode: 'recording_missing' });

    const request = await pipeline.ctx.prisma.studyPlanRequest.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'recording_failed' } },
    });
    expect(request.status).toBe('pending');

    const tick = await job().run(new Date('2026-01-05T10:05:00Z'));
    expect(tick.processed).toBeGreaterThanOrEqual(1);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'recording_failed' } },
    });
    expect(plan.status).toBe('active');
    const notes = plan.notes as Array<{ code: string }>;
    expect(notes[0]?.code).toBe('recording_failed');

    const completedRequest = await pipeline.ctx.prisma.studyPlanRequest.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'recording_failed' } },
    });
    expect(completedRequest.status).toBe('completed');
    expect(completedRequest.planId).toBe(plan.id);
  }, 60_000);

  it('drains_a_fallback_recorded_before_the_request_row_existed', async () => {
    const userId = await seedUser(pipeline.ctx, 'Cara');
    await makeProfiledLesson(pipeline.ctx, userId, {
      startedAt: new Date('2026-01-01T10:00:00Z'),
      errors: [{ tag: 'grammar:conditional-3' }],
    });
    const lessonId = await seedLesson(pipeline.ctx, [userId], new Date('2026-01-05T10:00:00Z'));
    // Simulates a branch F07 flagged before F15 shipped: fallback_requested_at set, no request row.
    await pipeline.ctx.prisma.lessonPipelineBranch.create({
      data: {
        lessonId,
        userId,
        stage: 'recording',
        status: 'failed',
        failureCode: 'recording_missing',
        fallbackRequestedAt: new Date('2026-01-05T10:01:00Z'),
      },
    });

    expect(
      await pipeline.ctx.prisma.studyPlanRequest.findUnique({
        where: { userId_lessonId_origin: { userId, lessonId, origin: 'recording_failed' } },
      }),
    ).toBeNull();

    await job().run(new Date('2026-01-05T10:05:00Z'));

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'recording_failed' } },
    });
    expect(plan.status).toBe('active');
  }, 60_000);

  it('an_analysis_blocked_on_gemini_gets_an_interim_plan_with_the_missing_key_note', async () => {
    const userId = await seedUser(pipeline.ctx, 'Dee');
    await makeProfiledLesson(pipeline.ctx, userId, {
      startedAt: new Date('2026-01-01T10:00:00Z'),
      errors: [{ tag: 'grammar:conditional-3' }],
    });
    const lessonId = await seedLesson(pipeline.ctx, [userId], new Date('2026-01-05T10:00:00Z'));
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId, userId, stage: 'lesson_analysis', status: 'blocked_missing_key' },
    });
    await pipeline.ctx.prisma.lessonPipelineStage.create({
      data: {
        branchId: branch.id,
        stage: 'lesson_analysis',
        status: 'blocked_missing_key',
        blockedProvider: 'gemini',
        reasonCode: 'credential_missing',
        reason: 'Add your Gemini key to analyze this lesson.',
      },
    });

    await job().run(new Date('2026-01-05T10:05:00Z'));

    const request = await pipeline.ctx.prisma.studyPlanRequest.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'analysis_blocked' } },
    });
    expect(request.status).toBe('completed');
    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'analysis_blocked' } },
    });
    expect(plan.composition).toBe('deterministic');
    expect(plan.deterministicReason).toBe('gemini_key_missing');
    const notes = plan.notes as Array<{ code: string }>;
    expect(notes.some((note) => note.code === 'gemini_key_missing')).toBe(true);
  }, 60_000);

  it('a_recovered_analysis_supersedes_the_interim_request_instead_of_composing', async () => {
    const userId = await seedUser(pipeline.ctx, 'Eve');
    await makeProfiledLesson(pipeline.ctx, userId, {
      startedAt: new Date('2026-01-01T10:00:00Z'),
      errors: [{ tag: 'grammar:conditional-3' }],
    });
    const lessonId = await seedLesson(pipeline.ctx, [userId], new Date('2026-01-05T10:00:00Z'));
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.create({
      data: { lessonId, userId, stage: 'lesson_analysis', status: 'blocked_missing_key' },
    });
    await pipeline.ctx.prisma.lessonPipelineStage.create({
      data: {
        branchId: branch.id,
        stage: 'lesson_analysis',
        status: 'blocked_missing_key',
        blockedProvider: 'gemini',
        reasonCode: 'credential_missing',
        reason: 'Add your Gemini key to analyze this lesson.',
      },
    });
    // The key was saved and analysis resumed and completed before this tick runs.
    await pipeline.ctx.prisma.lessonPipelineStage.update({
      where: { branchId_stage: { branchId: branch.id, stage: 'lesson_analysis' } },
      data: {
        status: 'completed',
        blockedProvider: null,
        reasonCode: null,
        reason: null,
        finishedAt: new Date(),
      },
    });
    await pipeline.ctx.prisma.studyPlanRequest.create({ data: { userId, lessonId, origin: 'analysis_blocked' } });

    await job().run(new Date('2026-01-05T10:05:00Z'));

    const request = await pipeline.ctx.prisma.studyPlanRequest.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'analysis_blocked' } },
    });
    expect(request.status).toBe('superseded');
    expect(
      await pipeline.ctx.prisma.studyPlan.findUnique({
        where: { userId_lessonId_origin: { userId, lessonId, origin: 'analysis_blocked' } },
      }),
    ).toBeNull();
  }, 60_000);

  it('never_claims_two_requests_for_the_same_user_in_one_tick', async () => {
    const userId = await seedUser(pipeline.ctx, 'Fay');
    await makeProfiledLesson(pipeline.ctx, userId, {
      startedAt: new Date('2026-01-01T10:00:00Z'),
      errors: [{ tag: 'grammar:conditional-3' }],
    });
    const lessonA = await seedLesson(pipeline.ctx, [userId], new Date('2026-01-05T10:00:00Z'));
    const lessonB = await seedLesson(pipeline.ctx, [userId], new Date('2026-01-06T10:00:00Z'));
    await pipeline.ctx.prisma.studyPlanRequest.create({ data: { userId, lessonId: lessonA, origin: 'recording_failed' } });
    await pipeline.ctx.prisma.studyPlanRequest.create({ data: { userId, lessonId: lessonB, origin: 'recording_failed' } });

    const tick = await job().run(new Date('2026-01-06T10:05:00Z'));
    expect(tick.processed).toBe(1);
  }, 60_000);
});
