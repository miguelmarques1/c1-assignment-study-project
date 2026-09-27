import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ContentBankService } from '../../src/content/content-bank.service';
import { fiveQuestions } from './helpers/content-fixtures';
import {
  createPipelineTestContext,
  makeProfileUpdateReadyLesson,
  resetPipelineTables,
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
async function seedCuratedItem(
  overrides: {
    slug: string;
    type: 'reading' | 'vocabulary' | 'grammar';
    targetTags: string[];
    cefrLevel?: 'C1' | 'C2' | 'B2';
    difficulty?: number;
    wordCount?: number;
  },
) {
  return pipeline.ctx.prisma.contentItem.create({
    data: {
      slug: overrides.slug,
      type: overrides.type,
      provenance: 'curated',
      cefrLevel: overrides.cefrLevel ?? 'C1',
      title: `Title for ${overrides.slug}`,
      topic: 'housing',
      difficulty: overrides.difficulty ?? 4,
      skills: [overrides.type === 'reading' ? 'reading' : overrides.type, 'grammar'],
      body: 'Some authentic-looking prose that stands in for a real curated passage in this test.',
      wordCount: overrides.wordCount ?? 500,
      questions: fiveQuestions() as never,
      targetTags: overrides.targetTags,
      sourceName: 'Test fixture',
    },
  });
}

describe('plan generation pipeline (F15)', () => {
  it('a_plan_is_generated_once_analysis_and_profile_update_complete', async () => {
    const reading = await seedCuratedItem({ slug: 'test-reading-conditional', type: 'reading', targetTags: ['grammar:conditional-3'] });
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('If I would have known I would have come.')],
        pronunciation: { status: 'assessed', scores: { pronunciation: 72, accuracy: 81, prosody: 66, fluency: 90, completeness: 95 } },
        analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'If I would have known', utteranceIdx: 0 }] },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
      include: { activities: true },
    });
    expect(plan.status).toBe('active');
    expect(plan.composition).toBe('deterministic');
    expect(plan.deterministicReason).toBe('gemini_key_missing');

    const days = new Set(plan.activities.map((activity) => activity.day));
    expect(days.size).toBe(7);
    for (let day = 1; day <= 7; day += 1) {
      const count = plan.activities.filter((activity) => activity.day === day).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }

    const readingActivity = plan.activities.find((activity) => activity.contentItemId === reading.id);
    expect(readingActivity).toBeDefined();
    expect(readingActivity!.targetTags).toContain('grammar:conditional-3');

    // Task slots (writing, and speaking since no phoneme weakness) are present alongside the bank item.
    expect(plan.activities.some((activity) => activity.kind === 'writing')).toBe(true);
    expect(plan.activities.some((activity) => activity.kind === 'speaking')).toBe(true);
  }, 60_000);

  it('every_bank_activity_references_an_existing_item_and_resolves_to_a_payload', async () => {
    await seedCuratedItem({ slug: 'test-reading-two', type: 'reading', targetTags: ['grammar:conditional-3'] });
    await seedCuratedItem({ slug: 'test-grammar-two', type: 'grammar', targetTags: ['grammar:conditional-3'] });
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('If I would have known I would have come.')],
        pronunciation: { status: 'assessed', scores: { pronunciation: 72, accuracy: 81, prosody: 66, fluency: 90, completeness: 95 } },
        analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'If I would have known', utteranceIdx: 0 }] },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
      include: { activities: true },
    });
    const bank = pipeline.ctx.app.get(ContentBankService);
    const bankActivities = plan.activities.filter((activity) => activity.contentItemId !== null);
    expect(bankActivities.length).toBeGreaterThan(0);
    const existing = await bank.existingIds(bankActivities.map((activity) => activity.contentItemId!));
    for (const activity of bankActivities) {
      expect(existing.has(activity.contentItemId!)).toBe(true);
      const payload = await bank.getPayload(activity.contentItemId!);
      expect(payload.questions).toHaveLength(5);
    }
  }, 60_000);

  it('every_non_task_activity_targets_a_tag_unmastered_for_the_owner', async () => {
    await seedCuratedItem({ slug: 'test-reading-three', type: 'reading', targetTags: ['grammar:conditional-3'] });
    await seedCuratedItem({ slug: 'test-reading-unrelated', type: 'reading', targetTags: ['grammar:passive-voice'] });
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('If I would have known I would have come.')],
        pronunciation: { status: 'assessed', scores: { pronunciation: 72, accuracy: 81, prosody: 66, fluency: 90, completeness: 95 } },
        analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'If I would have known', utteranceIdx: 0 }] },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
      include: { activities: true },
    });
    const unmastered = (await pipeline.ctx.prisma.errorLedgerEntry.findMany({ where: { userId: ana.id } })).map((entry) => entry.tag);
    for (const activity of plan.activities) {
      if (activity.placement === 'task') {
        continue;
      }
      expect(activity.targetTags.some((tag) => unmastered.includes(tag))).toBe(true);
    }
    // The unrelated reading (passive-voice) was never eligible, so it must not appear.
    expect(plan.activities.some((activity) => activity.title.includes('test-reading-unrelated'))).toBe(false);
  }, 60_000);

  it('a_first_lesson_without_a_profile_uses_general_c1_material', async () => {
    await seedCuratedItem({ slug: 'test-reading-general', type: 'reading', targetTags: ['grammar:conditional-3'], cefrLevel: 'C1' });
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('Everything went smoothly today.')],
        pronunciation: { status: 'assessed', scores: { pronunciation: 80, accuracy: 85, prosody: 80, fluency: 90, completeness: 95 } },
        analysis: { errors: [] },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    });
    expect(plan.generalMaterial).toBe(true);
    expect(plan.deterministicReason).toBe('no_profile');
    const notes = plan.notes as Array<{ code: string }>;
    expect(notes.some((note) => note.code === 'general_material')).toBe(true);
  }, 60_000);

  it('an_older_lesson_reaching_plan_generation_after_a_newer_one_is_superseded_with_no_plan', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const older = await makeProfileUpdateReadyLesson(
      pipeline,
      [
        {
          speaker: ana,
          utterances: [said('An older lesson.')],
          pronunciation: { status: 'assessed', scores: { pronunciation: 70, accuracy: 70, prosody: 70, fluency: 70, completeness: 90 } },
          analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'An older lesson.', utteranceIdx: 0 }] },
        },
      ],
      { durationSeconds: 600 },
    );
    // A newer lesson's analysis has already completed (and its plan is active) before the older one's stage runs.
    const newer = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('A newer lesson.')],
        pronunciation: { status: 'assessed', scores: { pronunciation: 70, accuracy: 70, prosody: 70, fluency: 70, completeness: 90 } },
        analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'A newer lesson.', utteranceIdx: 0 }] },
      },
    ]);
    // The fixtures don't control lesson.startedAt directly, so force the ordering explicitly.
    await pipeline.ctx.prisma.lesson.update({ where: { id: older.lessonId }, data: { startedAt: new Date('2026-01-01T10:00:00Z') } });
    await pipeline.ctx.prisma.lesson.update({ where: { id: newer.lessonId }, data: { startedAt: new Date('2026-01-02T10:00:00Z') } });

    const newerBranch = newer.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, newerBranch);
    await waitForStage(pipeline.ctx, newerBranch, 'plan_generation', ['completed']);
    const newerPlan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: newer.lessonId, origin: 'lesson' } },
    });
    expect(newerPlan.status).toBe('active');

    const olderBranch = older.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, olderBranch);
    await waitForStage(pipeline.ctx, olderBranch, 'plan_generation', ['completed']);

    const olderPlan = await pipeline.ctx.prisma.studyPlan.findUnique({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: older.lessonId, origin: 'lesson' } },
    });
    expect(olderPlan).toBeNull();
    const stillActive = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: newer.lessonId, origin: 'lesson' } },
    });
    expect(stillActive.status).toBe('active');
  }, 60_000);
});
