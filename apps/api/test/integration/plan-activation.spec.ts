import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlanActivationService } from '../../src/plans/plan-activation.service';
import { PlanActivityStateService } from '../../src/plans/plan-activity-state.service';
import { PlanComposerService } from '../../src/plans/plan-composer.service';
import { PlanReadService } from '../../src/plans/plan-read.service';
import { fiveQuestions } from './helpers/content-fixtures';
import {
  createPipelineTestContext,
  makeProfileUpdateReadyLesson,
  resetPipelineTables,
  seedLesson,
  seedSpeaker,
  startProfileUpdate,
  waitForStage,
  type PipelineTestContext,
  type SeedUtterance,
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

function said(text: string, startMs = 0, endMs = 4_000): SeedUtterance {
  return { startMs, endMs, text, confidence: 0.9 };
}

/** A minimal, constraint-satisfying curated item, inserted directly (no importer needed for these tests). */
async function seedCuratedItem(overrides: { slug: string; type: 'reading' | 'grammar'; targetTags: string[] }) {
  return pipeline.ctx.prisma.contentItem.create({
    data: {
      slug: overrides.slug,
      type: overrides.type,
      provenance: 'curated',
      cefrLevel: 'C1',
      title: `Title for ${overrides.slug}`,
      topic: 'housing',
      difficulty: 4,
      skills: [overrides.type === 'reading' ? 'reading' : 'grammar', 'grammar'],
      body: 'Some authentic-looking prose that stands in for a real curated passage in this test.',
      wordCount: 500,
      questions: fiveQuestions() as never,
      targetTags: overrides.targetTags,
      sourceName: 'Test fixture',
    },
  });
}

/** Drives one lesson for `ana` through profile_update into a completed plan_generation. */
async function buildPlanFor(ana: Awaited<ReturnType<typeof seedSpeaker>>, utterance: string, tag: string, startedAt: Date) {
  const lesson = await makeProfileUpdateReadyLesson(pipeline, [
    {
      speaker: ana,
      utterances: [said(utterance)],
      pronunciation: { status: 'assessed', scores: { pronunciation: 72, accuracy: 81, prosody: 66, fluency: 90, completeness: 95 } },
      analysis: { errors: [{ tag, quote: utterance, utteranceIdx: 0 }] },
    },
  ]);
  await pipeline.ctx.prisma.lesson.update({ where: { id: lesson.lessonId }, data: { startedAt } });
  const branchId = lesson.branches.get(ana.id)!;
  await startProfileUpdate(pipeline, branchId);
  await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);
  const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
    where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    include: { activities: true },
  });
  return { lesson, branchId, plan };
}

describe('plan activation (F15)', () => {
  it('exactly_one_plan_is_active_per_user', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const { plan } = await buildPlanFor(ana, 'If I would have known I would have come.', 'grammar:conditional-3', new Date('2026-01-01T10:00:00Z'));
    expect(plan.status).toBe('active');

    // The DB itself refuses a second active row for this user, regardless of lesson or origin.
    const otherLessonId = await seedLesson(pipeline.ctx, [ana.id], new Date('2026-01-02T10:00:00Z'));
    await expect(
      pipeline.ctx.prisma.studyPlan.create({
        data: {
          userId: ana.id,
          lessonId: otherLessonId,
          origin: 'recording_failed',
          status: 'active',
          precedenceAt: new Date(),
          composition: 'deterministic',
          deterministicReason: 'no_profile',
          generalMaterial: false,
          notes: [],
          focusTags: [],
          rulesVersion: '1',
          rulesFingerprint: 'x'.repeat(64),
          taxonomyVersion: '2',
          activatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/Unique constraint failed/);
  }, 60_000);

  it('archived_plans_remain_readable_with_their_statistics', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const { plan: first } = await buildPlanFor(ana, 'If I would have known I would have come.', 'grammar:conditional-3', new Date('2026-01-01T10:00:00Z'));

    const states = pipeline.ctx.app.get(PlanActivityStateService);
    const toComplete = first.activities[0]!;
    await states.markCompleted(ana.id, toComplete.id, { completionKey: randomUUID(), completedAt: new Date() });

    // A second, later lesson outranks and archives the first plan.
    await buildPlanFor(ana, 'A second lesson happened.', 'grammar:conditional-3', new Date('2026-01-05T10:00:00Z'));

    const reader = pipeline.ctx.app.get(PlanReadService);
    const archivedView = await reader.planFor(ana.id, first.id);
    expect(archivedView.status).toBe('archived');
    expect(archivedView.progress.completed).toBe(1);
    expect(archivedView.progress.total).toBe(first.activities.length);
  }, 60_000);

  it('generation_failing_leaves_the_previous_plan_active', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const { plan: first } = await buildPlanFor(ana, 'If I would have known I would have come.', 'grammar:conditional-3', new Date('2026-01-01T10:00:00Z'));

    const lesson2 = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('A second lesson that will fail to build a plan.')],
        pronunciation: { status: 'assessed', scores: { pronunciation: 72, accuracy: 81, prosody: 66, fluency: 90, completeness: 95 } },
        analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'A second lesson that will fail to build a plan.', utteranceIdx: 0 }] },
      },
    ]);
    await pipeline.ctx.prisma.lesson.update({ where: { id: lesson2.lessonId }, data: { startedAt: new Date('2026-01-05T10:00:00Z') } });
    const branchId2 = lesson2.branches.get(ana.id)!;

    await pipeline.ctx.prisma.$executeRawUnsafe(`
      CREATE FUNCTION f15_activation_fault() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected fault'; END $$ LANGUAGE plpgsql`);
    await pipeline.ctx.prisma.$executeRawUnsafe(
      'CREATE TRIGGER f15_activation_fault BEFORE INSERT ON study_plan_activities FOR EACH ROW EXECUTE FUNCTION f15_activation_fault()',
    );

    try {
      await startProfileUpdate(pipeline, branchId2);
      const failed = await waitForStage(pipeline.ctx, branchId2, 'plan_generation', ['failed']);
      expect(failed).toMatchObject({ reasonCode: 'internal_error' });

      const stillActive = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({ where: { id: first.id } });
      expect(stillActive.status).toBe('active');
      expect(
        await pipeline.ctx.prisma.studyPlan.findUnique({
          where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson2.lessonId, origin: 'lesson' } },
        }),
      ).toBeNull();

      const reader = pipeline.ctx.app.get(PlanReadService);
      const current = await reader.currentFor(ana.id, new Date());
      expect(current.plan?.id).toBe(first.id);
      expect(current.failure).not.toBeNull();
      expect(current.failure?.retryable).toBe(true);
    } finally {
      await pipeline.ctx.prisma.$executeRawUnsafe('DROP TRIGGER f15_activation_fault ON study_plan_activities');
      await pipeline.ctx.prisma.$executeRawUnsafe('DROP FUNCTION f15_activation_fault()');
    }
  }, 60_000);

  it('carries_up_to_five_unfinished_still_unmastered_activities_marked_carried_over', async () => {
    await seedCuratedItem({ slug: 'carry-reading-1', type: 'reading', targetTags: ['grammar:conditional-3'] });
    await seedCuratedItem({ slug: 'carry-reading-2', type: 'reading', targetTags: ['grammar:conditional-3'] });
    await seedCuratedItem({ slug: 'carry-grammar-1', type: 'grammar', targetTags: ['grammar:conditional-3'] });
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const { plan: first } = await buildPlanFor(ana, 'If I would have known I would have come.', 'grammar:conditional-3', new Date('2026-01-01T10:00:00Z'));
    const pendingBefore = first.activities.filter((activity) => activity.state === 'pending');
    expect(pendingBefore.length).toBeGreaterThan(5);

    const { plan: second } = await buildPlanFor(ana, 'A second lesson, same weakness.', 'grammar:conditional-3', new Date('2026-01-05T10:00:00Z'));

    const carried = second.activities.filter((activity) => activity.carriedFromActivityId !== null);
    expect(carried.length).toBeGreaterThan(0);
    expect(carried.length).toBeLessThanOrEqual(5);
    for (const activity of carried) {
      const source = pendingBefore.find((candidate) => candidate.id === activity.carriedFromActivityId);
      expect(source).toBeDefined();
    }

    const reader = pipeline.ctx.app.get(PlanReadService);
    const view = await reader.planFor(ana.id, second.id);
    const carriedInView = view.sessions.flatMap((session) => session.activities).filter((activity) => activity.carriedOver);
    expect(carriedInView.length).toBe(carried.length);
  }, 60_000);

  it('activation_is_idempotent_per_lesson_and_origin', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const { lesson, plan: first } = await buildPlanFor(
      ana,
      'If I would have known I would have come.',
      'grammar:conditional-3',
      new Date('2026-01-01T10:00:00Z'),
    );

    // A second, independent composition for the exact same (user, lesson,
    // origin) — as a retried stage run would produce — never builds a
    // second plan; activation recognises the existing one and returns it.
    const composer = pipeline.ctx.app.get(PlanComposerService);
    const activation = pipeline.ctx.app.get(PlanActivationService);
    const composed = await composer.compose({ userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson', now: new Date() });
    const lessonRow = await pipeline.ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.lessonId } });
    const result = await pipeline.ctx.prisma.$transaction((tx) =>
      activation.activate(tx, ana.id, composed, lessonRow.startedAt ?? lessonRow.openedAt!),
    );
    expect(result).toEqual({ planId: first.id, outcome: 'existing' });

    const plans = await pipeline.ctx.prisma.studyPlan.findMany({
      where: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' },
    });
    expect(plans).toHaveLength(1);
  }, 60_000);
});
