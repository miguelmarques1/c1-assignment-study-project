import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderValidationService } from '../../src/credentials/validation/provider-validation.service';
import type { ValidationOutcome } from '../../src/credentials/validation/validation-outcome';
import { PIPELINE_QUEUE, pipelineJobId } from '../../src/pipeline/pipeline.constants';
import { PipelineDrainJob } from '../../src/pipeline/pipeline-drain.job';
import { PipelineQueueService } from '../../src/pipeline/pipeline-queue.service';
import { PipelineStateService } from '../../src/pipeline/pipeline-state.service';
import {
  createPipelineTestContext,
  launchAll,
  makeRecordedLesson,
  resetPipelineTables,
  seedSpeaker,
  storeAzureKey,
  waitForStage,
  type PipelineTestContext,
} from './helpers/pipeline-fixtures';

const validateMock = vi.fn<(...args: unknown[]) => Promise<ValidationOutcome>>();

let pipeline: PipelineTestContext;

function drain(): PipelineDrainJob {
  return pipeline.ctx.app.get(PipelineDrainJob);
}

function queue(): Queue {
  return pipeline.ctx.app.get<Queue>(getQueueToken(PIPELINE_QUEUE));
}

beforeAll(async () => {
  pipeline = await createPipelineTestContext({
    overrides: [{ token: ProviderValidationService, useValue: { validate: validateMock } }],
  });
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  validateMock.mockReset();
  await resetPipelineTables(pipeline.ctx);
});

describe('pipeline drain', () => {
  it('saving_a_valid_key_resumes_the_blocked_stage', async () => {
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: bruno }]);
    const branchId = lesson.branches.get(bruno.id)!;
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['blocked_missing_key']);

    validateMock.mockResolvedValue({ status: 'valid', providerMessage: null });
    const key = 'azure-key-bruno-saves-later-0000000000';
    const saved = await request(pipeline.ctx.app.getHttpServer())
      .put('/credentials/azure_speech')
      .set('Cookie', bruno.cookie)
      .send({ key, region: 'westeurope' });
    expect(saved.status).toBe(200);

    // One tick of the drain is all it takes — no call from settings into the pipeline.
    await drain().run();
    const resumed = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'transcription' } },
    });
    expect(resumed.run).toBe(2);
    expect(['queued', 'running', 'completed']).toContain(resumed.status);
    expect(resumed.reasonCode).toBeNull();
    expect(resumed.blockedProvider).toBeNull();

    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
    expect(pipeline.speech.calls).toEqual([expect.objectContaining({ key, region: 'westeurope' })]);
  }, 60_000);

  it('an_unverified_key_also_resumes', async () => {
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: bruno }]);
    const branchId = lesson.branches.get(bruno.id)!;
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['blocked_missing_key']);

    await storeAzureKey(pipeline.ctx, bruno.id, 'azure-key-probe-unreachable-000000', 'eastus2', 'unverified');
    await drain().run();

    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
  }, 60_000);

  it('a_still_invalid_key_stays_blocked', async () => {
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: bruno }]);
    const branchId = lesson.branches.get(bruno.id)!;
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['blocked_missing_key']);

    await storeAzureKey(pipeline.ctx, bruno.id, 'azure-key-already-refused-00000000', 'eastus2', 'invalid');
    await drain().run();

    const row = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'transcription' } },
    });
    expect(row).toMatchObject({ status: 'blocked_missing_key', run: 1 });
    expect(pipeline.speech.calls).toHaveLength(0);
  }, 60_000);

  it('drains_branches_queued_before_f08', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    // F07 left the branch launched at recording/queued, with no stage row and no job.
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await drain().run();

    const done = await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
    expect(done.run).toBe(1);
    expect(await pipeline.ctx.prisma.lessonTranscript.count({ where: { lessonId: lesson.lessonId } })).toBe(1);
  }, 60_000);

  it('re_enqueues_a_queued_stage_whose_job_is_missing', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;
    // The row exists, but the add that should have followed never happened.
    await pipeline.ctx.app.get(PipelineStateService).queueStage(branchId, 'transcription', new Date());
    expect(await queue().getJob(pipelineJobId('transcription', branchId, 1))).toBeUndefined();

    await drain().run();

    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
    expect(pipeline.speech.calls).toHaveLength(1);
  }, 60_000);

  it('ignores_stages_without_a_registered_handler', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;
    // profile_update is F11's next stage, appended one feature early exactly
    // like every earlier stage was — F12 has not registered its handler
    // yet, so a branch that reaches it just waits.
    await pipeline.ctx.app.get(PipelineStateService).queueStage(branchId, 'profile_update', new Date());

    await drain().run();

    const waiting = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'profile_update' } },
    });
    expect(waiting.status).toBe('queued');
    expect(await queue().getJob(pipelineJobId('profile_update', branchId, 1))).toBeUndefined();
  }, 60_000);

  it('a_stage_whose_job_died_mid_run_is_failed_not_rerun', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;
    // Mid-run, as the runner left it when recording the outcome itself threw.
    const row = await pipeline.ctx.app.get(PipelineStateService).ensureStage(branchId, 'transcription', new Date());
    await pipeline.ctx.prisma.lessonPipelineStage.update({
      where: { id: row.id },
      data: { status: 'running', attempts: 1, startedAt: new Date(), lastAttemptAt: new Date() },
    });
    const queueService = pipeline.ctx.app.get(PipelineQueueService);
    const jobState = vi.spyOn(queueService, 'jobState').mockResolvedValue('failed');
    const replaceJob = vi.spyOn(queueService, 'replaceJob');

    try {
      await drain().run();
    } finally {
      jobState.mockRestore();
    }

    const failed = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({ where: { id: row.id } });
    expect(failed).toMatchObject({
      status: 'failed',
      reasonCode: 'internal_error',
      reason: 'Something went wrong while processing this stage.',
      run: 1,
    });
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ status: 'failed', failureCode: 'internal_error' });
    expect(replaceJob).not.toHaveBeenCalledWith(branchId, 'transcription', 1);
    replaceJob.mockRestore();
    expect(pipeline.speech.calls).toHaveLength(0);
  }, 60_000);

  it('a_second_drain_never_duplicates_a_job', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;

    await Promise.all([drain().run(), drain().run()]);
    await drain().run();

    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
    // Let anything duplicated get the chance to run before counting.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(pipeline.speech.calls).toHaveLength(1);
    expect(await pipeline.ctx.prisma.lessonTranscript.count({ where: { lessonId: lesson.lessonId } })).toBe(1);
  }, 60_000);
});
