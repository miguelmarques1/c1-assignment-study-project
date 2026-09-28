import { getQueueToken } from '@nestjs/bullmq';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { PipelineDrainJob } from '../../src/pipeline/pipeline-drain.job';
import { PIPELINE_QUEUE, pipelineJobId } from '../../src/pipeline/pipeline.constants';
import { PipelineStateService } from '../../src/pipeline/pipeline-state.service';
import { PipelineService } from '../../src/pipeline/pipeline.service';
import { LearningProfileReader } from '../../src/profile/learning-profile.reader';
import { PARTIAL_UPDATE_BLOCKED_NOTE, PARTIAL_UPDATE_FAILED_NOTE } from '../../src/profile/profile.constants';
import { ProfileReconciliationJob } from '../../src/profile-update/profile-reconciliation.job';
import { gemini } from './helpers/fake-gemini';
import {
  createPipelineTestContext,
  makeAnalysisReadyLesson,
  makeProfileUpdateReadyLesson,
  resetPipelineTables,
  seedSpeaker,
  startAnalysis,
  startProfileUpdate,
  waitForStage,
  type AnalysisReadyPronunciation,
  type PipelineTestContext,
  type SeedUtterance,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

const queue = () => pipeline.ctx.app.get<Queue>(getQueueToken(PIPELINE_QUEUE));
const job = () => pipeline.ctx.app.get(ProfileReconciliationJob);
const profiles = () => pipeline.ctx.app.get(LearningProfileReader);

function said(text: string, startMs = 0, endMs = 4_000): SeedUtterance {
  return { startMs, endMs, text, confidence: 0.9 };
}

function assessed(scores: { pronunciation: number; accuracy: number; prosody: number | null }): AnalysisReadyPronunciation {
  return { status: 'assessed', scores: { ...scores, fluency: 99, completeness: 98 } };
}

async function competencies(userId: string): Promise<Record<string, number>> {
  const rows = await pipeline.ctx.prisma.profileCompetency.findMany({ where: { userId } });
  return Object.fromEntries(rows.map((row) => [row.competency, row.score]));
}

async function sourceKinds(userId: string): Promise<string[]> {
  const rows = await pipeline.ctx.prisma.profileSource.findMany({ where: { userId }, orderBy: { kind: 'asc' } });
  return rows.map((row) => row.kind);
}

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
  // The sweep runs only when a test calls it, so its counts are exact.
  pipeline.ctx.app.get(SchedulerRegistry).deleteInterval('profile-reconciliation');
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  gemini.reset();
  pipeline.pronunciation.reset();
  await resetPipelineTables(pipeline.ctx);
});

describe('profile update pipeline', () => {
  it('the_stage_ingests_the_lesson_and_queues_plan_generation_which_completes_the_branch', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('If I would have known I would have come.')],
        pronunciation: assessed({ pronunciation: 72, accuracy: 81, prosody: 66 }),
        analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'If I would have known', utteranceIdx: 0 }] },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startProfileUpdate(pipeline, branchId);
    const row = await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    expect(row).toMatchObject({ attempts: 1, reasonCode: null, progressTotal: null });
    expect(await sourceKinds(ana.id)).toEqual(['lesson_analysis', 'lesson_pronunciation']);
    const queuedNext = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'plan_generation' } },
    });
    // Not asserting `status: 'queued'` here: F15 registers a handler, so the
    // job can already be running (or, under load, even completed) by the
    // time this read happens — `run: 1` is the only part of this that's
    // stable regardless of how fast the worker picks it up.
    expect(queuedNext).toMatchObject({ run: 1 });
    // F15 registers a handler, so profile_update's completion enqueues it automatically.
    expect(await queue().getJob(pipelineJobId('plan_generation', branchId, 1))).toBeDefined();

    // No Gemini key: F15 composes deterministically and the pipeline's last
    // stage completes, which is also the branch's terminal status (F15).
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'plan_generation', status: 'completed' });
    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    });
    expect(plan).toMatchObject({ status: 'active', composition: 'deterministic', deterministicReason: 'gemini_key_missing' });
  }, 60_000);

  it('lesson_scores_update_the_six_competencies_from_their_own_sources', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('I think we should leave before the storm arrives.')],
        pronunciation: assessed({ pronunciation: 72, accuracy: 81, prosody: 66 }),
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    // Through F11's real stage (Gemini faked at the SDK) into F12's.
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    // Pronunciation from F10's aggregate; the other five from F11's fake analysis (65/70/72/68/75).
    expect(await competencies(ana.id)).toEqual({
      pronunciation: 72,
      grammar: 65,
      vocabulary: 70,
      fluency: 72,
      interaction: 68,
      comprehension: 75,
    });
    const pronunciation = await pipeline.ctx.prisma.profileCompetency.findUniqueOrThrow({
      where: { userId_competency: { userId: ana.id, competency: 'pronunciation' } },
    });
    expect(pronunciation).toMatchObject({ accuracy: 81, prosody: 66 });
    const weights = await pipeline.ctx.prisma.profileMeasurement.findMany({ where: { userId: ana.id }, select: { weight: true } });
    expect(weights).toHaveLength(6);
    expect(weights.every((row) => Math.abs(row.weight - 0.35) < 1e-6)).toBe(true);
  }, 60_000);

  it('analysis_errors_reach_the_ledger_with_their_quotes', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const line = 'If I would have known about the storm I would have left earlier.';
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said(line)] }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    const errors = await pipeline.ctx.prisma.lessonAnalysisError.findMany({ where: { userId: ana.id } });
    const occurrences = await pipeline.ctx.prisma.errorLedgerOccurrence.findMany({ where: { userId: ana.id } });
    expect(occurrences).toHaveLength(errors.length);
    expect(occurrences[0]).toMatchObject({
      tag: 'grammar:conditional-3',
      quote: line,
      correction: errors[0]!.correction,
      severity: errors[0]!.severity,
      analysisErrorId: errors[0]!.id,
      utteranceId: errors[0]!.utteranceId,
      lessonId: lesson.lessonId,
    });
    expect(occurrences[0]!.utteranceId).not.toBeNull();
  }, 60_000);

  it('counts_increment_across_consecutive_lessons_carrying_the_same_tag', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const earlier = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('If I would have gone.')] }], {
      durationSeconds: 3 * 24 * 3600,
    });
    await startAnalysis(pipeline, earlier.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, earlier.branches.get(ana.id)!, 'profile_update', ['completed']);
    const first = await pipeline.ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: ana.id } });
    expect(first).toMatchObject({ tag: 'grammar:conditional-3', occurrenceCount: 1 });

    const later = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('If she would have called.')] }]);
    await startAnalysis(pipeline, later.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, later.branches.get(ana.id)!, 'profile_update', ['completed']);

    const second = await pipeline.ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: ana.id } });
    expect(second).toMatchObject({ id: first.id, occurrenceCount: 2 });
    expect(second.firstSeenAt).toEqual(earlier.startedAt);
    expect(second.lastSeenAt).toEqual(later.startedAt);
  }, 90_000);

  it('rerunning_the_profile_update_does_not_change_any_occurrence_count', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('I goed there and I have went home.')],
        pronunciation: {
          ...assessed({ pronunciation: 70, accuracy: 70, prosody: 70 }),
          phonemeTags: [{ tag: 'phoneme:/θ/', phoneme: 'θ', occurrences: 3, meanAccuracy: 40, exampleWords: ['think'] }],
        },
        analysis: {
          errors: [
            { tag: 'grammar:past-simple', quote: 'I goed there' },
            { tag: 'grammar:present-perfect', quote: 'I have went home' },
          ],
        },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);
    const before = await pipeline.ctx.prisma.errorLedgerEntry.findMany({ where: { userId: ana.id }, orderBy: { tag: 'asc' } });
    const scoresBefore = await competencies(ana.id);

    const rerun = await pipeline.ctx.app.get(PipelineStateService).queueStage(branchId, 'profile_update', new Date());
    expect(rerun.run).toBe(2);
    await startProfileUpdate(pipeline, branchId, 2);
    const row = await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);
    expect(row.run).toBe(2);

    const after = await pipeline.ctx.prisma.errorLedgerEntry.findMany({ where: { userId: ana.id }, orderBy: { tag: 'asc' } });
    expect(after.map((entry) => [entry.tag, entry.occurrenceCount])).toEqual(
      before.map((entry) => [entry.tag, entry.occurrenceCount]),
    );
    expect(await pipeline.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: ana.id } })).toBe(3);
    expect(await pipeline.ctx.prisma.profileSource.count({ where: { userId: ana.id } })).toBe(2);
    expect(await competencies(ana.id)).toEqual(scoresBefore);
  }, 60_000);

  it('phoneme_tags_from_f10_reach_the_ledger', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('I think three things are worth it.')],
        pronunciation: {
          ...assessed({ pronunciation: 70, accuracy: 70, prosody: 70 }),
          phonemeTags: [
            { tag: 'phoneme:/θ/', phoneme: 'θ', occurrences: 4, meanAccuracy: 40, exampleWords: ['think', 'three'] },
            { tag: 'phoneme:/ɹ/', phoneme: 'ɹ', occurrences: 1, meanAccuracy: 55, exampleWords: ['worth'] },
          ],
        },
        analysis: {},
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    const entries = await pipeline.ctx.prisma.errorLedgerEntry.findMany({ where: { userId: ana.id }, orderBy: { tag: 'asc' } });
    expect(entries.map((entry) => [entry.tag, entry.family, entry.occurrenceCount])).toEqual([
      ['phoneme:/ɹ/', 'phoneme', 1],
      ['phoneme:/θ/', 'phoneme', 1],
    ]);
    const theta = await pipeline.ctx.prisma.errorLedgerOccurrence.findFirstOrThrow({ where: { userId: ana.id, tag: 'phoneme:/θ/' } });
    expect(theta).toMatchObject({ instances: 4, exampleWords: ['think', 'three'], quote: null, lessonId: lesson.lessonId });
  }, 60_000);

  it('pronunciation_updates_when_the_analysis_is_blocked', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: false });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('hello there')], pronunciation: assessed({ pronunciation: 64, accuracy: 70, prosody: null }) },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['blocked_missing_key']);

    await job().run();

    expect(await competencies(ana.id)).toEqual({ pronunciation: 64 });
    expect(await sourceKinds(ana.id)).toEqual(['lesson_pronunciation']);
    const snapshot = await profiles().snapshotFor(ana.id);
    expect(snapshot.notes).toEqual([PARTIAL_UPDATE_BLOCKED_NOTE]);
    expect(snapshot.competencies.filter((entry) => entry.score !== null).map((entry) => entry.competency)).toEqual([
      'pronunciation',
    ]);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'lesson_analysis', status: 'blocked_missing_key' });
  }, 60_000);

  it('pronunciation_updates_when_the_analysis_failed', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('hello there Ana')], pronunciation: assessed({ pronunciation: 58, accuracy: 61, prosody: 55 }) },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(ana.geminiKey!, { kind: 'invalid' }, { kind: 'invalid' });
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['failed']);

    await job().run();

    expect(await competencies(ana.id)).toEqual({ pronunciation: 58 });
    expect((await profiles().snapshotFor(ana.id)).notes).toEqual([PARTIAL_UPDATE_FAILED_NOTE]);
  }, 60_000);

  it('the_job_backfills_lessons_processed_before_f12', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: false });
    // Two lessons analysed before F12 existed: branches rest at profile_update with no job.
    const analysed = await makeProfileUpdateReadyLesson(
      pipeline,
      [{ speaker: ana, utterances: [said('first lesson')], pronunciation: assessed({ pronunciation: 60, accuracy: 60, prosody: 60 }), analysis: {} }],
      { durationSeconds: 5 * 24 * 3600 },
    );
    const alsoAnalysed = await makeProfileUpdateReadyLesson(
      pipeline,
      [{ speaker: ana, utterances: [said('second lesson')], analysis: { scores: { grammar: 80 } } }],
      { durationSeconds: 4 * 24 * 3600 },
    );
    // And one whose analysis never ran (the owner has no Gemini key): pronunciation only.
    const blocked = await makeProfileUpdateReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('third lesson')], pronunciation: assessed({ pronunciation: 90, accuracy: 90, prosody: 90 }), analysis: null },
    ]);

    const swept = await job().run();
    expect(swept).toEqual({ checked: 3, applied: 3 });
    expect(await pipeline.ctx.prisma.profileSource.count({ where: { userId: ana.id, kind: 'lesson_pronunciation' } })).toBe(3);

    await pipeline.ctx.app.get(PipelineDrainJob).run();
    await waitForStage(pipeline.ctx, analysed.branches.get(ana.id)!, 'profile_update', ['completed']);
    await waitForStage(pipeline.ctx, alsoAnalysed.branches.get(ana.id)!, 'profile_update', ['completed']);

    const sources = await pipeline.ctx.prisma.profileSource.findMany({ where: { userId: ana.id } });
    const perLesson = (lessonId: string) => sources.filter((source) => source.lessonId === lessonId).map((source) => source.kind).sort();
    expect(perLesson(analysed.lessonId)).toEqual(['lesson_analysis', 'lesson_pronunciation']);
    expect(perLesson(alsoAnalysed.lessonId)).toEqual(['lesson_analysis', 'lesson_pronunciation']);
    expect(perLesson(blocked.lessonId)).toEqual(['lesson_pronunciation']);
    expect(await job().run()).toEqual({ checked: 0, applied: 0 });
  }, 90_000);

  it('the_job_and_the_stage_racing_ingest_once', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('racing')], pronunciation: assessed({ pronunciation: 75, accuracy: 75, prosody: 75 }), analysis: {} },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await Promise.all([job().run(), startProfileUpdate(pipeline, branchId)]);
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    expect(await pipeline.ctx.prisma.profileSource.count({ where: { userId: ana.id, kind: 'lesson_pronunciation' } })).toBe(1);
    expect(
      await pipeline.ctx.prisma.profileMeasurement.count({ where: { userId: ana.id, competency: 'pronunciation' } }),
    ).toBe(1);
  }, 60_000);

  it('profile_update_calls_no_provider', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('no provider')], pronunciation: assessed({ pronunciation: 75, accuracy: 75, prosody: 75 }), analysis: {} },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);
    await job().run();

    expect(gemini.calls).toHaveLength(0);
    expect(pipeline.pronunciation.calls).toHaveLength(0);
    expect(await pipeline.ctx.prisma.credentialUsage.count()).toBe(0);
  }, 60_000);

  it('each_participant_is_profiled_independently', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: false });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('If I would have known.')], pronunciation: assessed({ pronunciation: 70, accuracy: 70, prosody: 70 }) },
      { speaker: bruno, utterances: [said('Bruno line.')], pronunciation: assessed({ pronunciation: 50, accuracy: 50, prosody: 50 }) },
    ]);
    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await startAnalysis(pipeline, lesson.branches.get(bruno.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'profile_update', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'lesson_analysis', ['blocked_missing_key']);
    await job().run();

    expect(Object.keys(await competencies(ana.id)).sort()).toEqual(
      ['comprehension', 'fluency', 'grammar', 'interaction', 'pronunciation', 'vocabulary'].sort(),
    );
    expect(await competencies(bruno.id)).toEqual({ pronunciation: 50 });
    expect((await profiles().snapshotFor(ana.id)).notes).toEqual([]);
    expect((await profiles().snapshotFor(bruno.id)).notes).toEqual([PARTIAL_UPDATE_BLOCKED_NOTE]);
    // Ana's profile never carries Bruno's evidence, and the other way round.
    expect(await pipeline.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: bruno.id } })).toBe(0);
  }, 90_000);

  it('a_database_fault_fails_the_stage_as_internal_error_and_retries_clean', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeProfileUpdateReadyLesson(pipeline, [
      {
        speaker: ana,
        utterances: [said('fault')],
        analysis: { errors: [{ tag: 'grammar:past-simple', quote: 'I goed' }, { tag: 'vocab:collocation', quote: 'make a photo' }] },
      },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    // Every ledger insert fails, after the source and its measurements were already written in the same transaction.
    await pipeline.ctx.prisma.$executeRawUnsafe(`
      CREATE FUNCTION f12_fault() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected fault'; END $$ LANGUAGE plpgsql`);
    await pipeline.ctx.prisma.$executeRawUnsafe(
      'CREATE TRIGGER f12_fault BEFORE INSERT ON error_ledger_occurrences FOR EACH ROW EXECUTE FUNCTION f12_fault()',
    );

    try {
      await startProfileUpdate(pipeline, branchId);
      const failed = await waitForStage(pipeline.ctx, branchId, 'profile_update', ['failed']);

      // Retried on its own schedule (shortened here), then failed for the owner to retry.
      expect(failed).toMatchObject({ reasonCode: 'internal_error', attempts: 3 });
      expect(await pipeline.ctx.prisma.profileSource.count({ where: { userId: ana.id } })).toBe(0);
      expect(await pipeline.ctx.prisma.profileMeasurement.count({ where: { userId: ana.id } })).toBe(0);
      expect(await pipeline.ctx.prisma.learningProfile.count({ where: { userId: ana.id } })).toBe(0);
      const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
      expect(branch).toMatchObject({ stage: 'profile_update', status: 'failed', failureCode: 'internal_error' });
    } finally {
      await pipeline.ctx.prisma.$executeRawUnsafe('DROP TRIGGER f12_fault ON error_ledger_occurrences');
      await pipeline.ctx.prisma.$executeRawUnsafe('DROP FUNCTION f12_fault()');
    }

    const view = await pipeline.ctx.app.get(PipelineService).retry(lesson.lessonId, ana.id);
    expect(view.branch?.stages.find((stage) => stage.stage === 'profile_update')).toMatchObject({ status: 'queued' });
    const completed = await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);

    expect(completed.run).toBe(2);
    expect(await pipeline.ctx.prisma.profileSource.count({ where: { userId: ana.id } })).toBe(2);
    expect(await pipeline.ctx.prisma.profileMeasurement.count({ where: { userId: ana.id } })).toBe(5);
    expect(await pipeline.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: ana.id } })).toBe(2);
  }, 60_000);
});
