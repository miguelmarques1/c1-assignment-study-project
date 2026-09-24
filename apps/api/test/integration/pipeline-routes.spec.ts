import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createPipelineTestContext,
  launchAll,
  makeRecordedLesson,
  resetPipelineTables,
  seedSpeaker,
  waitForStage,
  type PipelineTestContext,
  type Speaker,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

function http() {
  return request(pipeline.ctx.app.getHttpServer());
}

function readPipeline(lessonId: string, speaker: Speaker) {
  return http().get(`/lessons/${lessonId}/pipeline`).set('Cookie', speaker.cookie);
}

function retry(lessonId: string, speaker: Speaker) {
  return http().post(`/lessons/${lessonId}/pipeline/retry`).set('Cookie', speaker.cookie);
}

/** Three quota failures in a row exhaust the shortened schedule and fail the stage. */
function scriptQuotaFailure(speaker: Speaker): void {
  for (let i = 0; i < 4; i += 1) {
    pipeline.speech.script(speaker.azureKey!, { kind: 'status', status: 429, message: 'Quota exceeded.' });
  }
}

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  await resetPipelineTables(pipeline.ctx);
});

describe('GET /lessons/:lessonId/pipeline', () => {
  it('returns_the_callers_branch_with_every_stage', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);

    const response = await readPipeline(lesson.lessonId, ana);

    expect(response.status).toBe(200);
    const view = response.body.data;
    expect(view.lessonId).toBe(lesson.lessonId);
    expect(Date.parse(view.serverTime)).not.toBeNaN();
    expect(view.branch).toMatchObject({ stage: 'excerpt_selection', status: 'queued' });
    expect(view.branch.stages.map((stage: { stage: string; status: string }) => [stage.stage, stage.status])).toEqual([
      ['recording', 'completed'],
      ['transcription', 'completed'],
      ['excerpt_selection', 'queued'],
    ]);
    const transcription = view.branch.stages[1];
    expect(transcription.startedAt).not.toBeNull();
    expect(transcription.finishedAt).not.toBeNull();
    expect(transcription).toMatchObject({ attempts: 1, reasonCode: null, retryable: false });
  }, 60_000);

  it('the_view_never_carries_another_participants_branch', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withKey: false });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    scriptQuotaFailure(bruno);
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['blocked_missing_key']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['failed']);

    const asAna = JSON.stringify((await readPipeline(lesson.lessonId, ana)).body);
    const asBruno = JSON.stringify((await readPipeline(lesson.lessonId, bruno)).body);

    expect(asAna).toContain('credential_missing');
    expect(asAna).not.toContain('transcription_quota_exceeded');
    expect(asAna).not.toContain('Quota exceeded.');
    expect(asAna).not.toContain(bruno.id);
    expect(asBruno).toContain('transcription_quota_exceeded');
    expect(asBruno).not.toContain('credential_missing');
    expect(asBruno).not.toContain(ana.id);
  }, 60_000);

  it('a_lesson_without_branches_returns_null', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await pipeline.ctx.prisma.lessonPipelineBranch.deleteMany({ where: { lessonId: lesson.lessonId } });
    await pipeline.ctx.prisma.lesson.update({ where: { id: lesson.lessonId }, data: { recordingStatus: 'too_short' } });

    const response = await readPipeline(lesson.lessonId, ana);

    expect(response.status).toBe(200);
    expect(response.body.data.branch).toBeNull();
  }, 60_000);

  it('a_recording_failure_is_derived_from_f07', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await pipeline.ctx.prisma.lessonPipelineBranch.update({
      where: { id: lesson.branches.get(ana.id)! },
      data: {
        stage: 'recording',
        status: 'failed',
        failureCode: 'recording_missing',
        failureReason: 'Recording is empty or missing.',
        launchedAt: null,
      },
    });

    const response = await readPipeline(lesson.lessonId, ana);

    expect(response.body.data.branch.stages).toEqual([
      expect.objectContaining({
        stage: 'recording',
        status: 'failed',
        reasonCode: 'recording_missing',
        reason: 'Recording is empty or missing.',
        retryable: false,
      }),
    ]);
  }, 60_000);
});

describe('POST /lessons/:lessonId/pipeline/retry', () => {
  it('retry_requeues_a_failed_transcription', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    scriptQuotaFailure(ana);
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['failed']);

    const response = await retry(lesson.lessonId, ana);

    expect(response.status).toBe(202);
    const transcription = response.body.data.branch.stages.find(
      (stage: { stage: string }) => stage.stage === 'transcription',
    );
    expect(['queued', 'running', 'completed']).toContain(transcription.status);
    expect(transcription.reasonCode).toBeNull();

    const done = await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
    expect(done.run).toBe(2);
    // Attempts accumulate across runs: four failed, then one that worked.
    expect(done.attempts).toBe(5);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch.failureCode).toBeNull();
  }, 60_000);

  it('retry_reruns_downstream_stages', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    const branchId = lesson.branches.get(ana.id)!;
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);
    // A later stage that had already been reached once, and a transcription failed by hand after it.
    await pipeline.ctx.prisma.lessonPipelineStage.update({
      where: { branchId_stage: { branchId, stage: 'transcription' } },
      data: {
        status: 'failed',
        reasonCode: 'transcription_service_error',
        reason: 'Azure Speech could not transcribe this recording.',
      },
    });
    await pipeline.ctx.prisma.lessonPipelineBranch.update({
      where: { id: branchId },
      data: {
        stage: 'transcription',
        status: 'failed',
        failureCode: 'transcription_service_error',
        failureReason: 'Azure Speech could not transcribe this recording.',
      },
    });

    expect((await retry(lesson.lessonId, ana)).status).toBe(202);
    await waitForStage(pipeline.ctx, branchId, 'transcription', ['completed']);

    const next = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'excerpt_selection' } },
    });
    expect(next).toMatchObject({ status: 'queued', run: 2 });
  }, 60_000);

  it('retry_is_rejected_when_nothing_failed', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['blocked_missing_key']);

    const completed = await retry(lesson.lessonId, ana);
    expect(completed.status).toBe(409);
    expect(completed.body.error.code).toBe('PIPE001');
    expect(completed.body.error.details).toEqual({ stage: 'excerpt_selection', status: 'queued' });

    const blocked = await retry(lesson.lessonId, bruno);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PIPE001');
    expect(blocked.body.error.details).toEqual({ stage: 'transcription', status: 'blocked_missing_key' });

    await pipeline.ctx.prisma.lessonPipelineBranch.deleteMany({ where: { lessonId: lesson.lessonId } });
    const none = await retry(lesson.lessonId, ana);
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('PIPE001');
    expect(none.body.error.details).toEqual({ stage: null, status: null });
  }, 60_000);

  it('retry_of_a_recording_failure_points_to_the_recording_route', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await pipeline.ctx.prisma.lessonPipelineBranch.update({
      where: { id: lesson.branches.get(ana.id)! },
      data: { stage: 'recording', status: 'failed', failureCode: 'recording_missing', failureReason: 'Recording is empty or missing.' },
    });

    const response = await retry(lesson.lessonId, ana);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PIPE002');
    expect(response.body.error.details).toEqual({ retryRoute: `/lessons/${lesson.lessonId}/recording/retry` });
  }, 60_000);

  it('retry_touches_only_the_callers_branch', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    scriptQuotaFailure(ana);
    scriptQuotaFailure(bruno);
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }]);
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['failed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['failed']);

    expect((await retry(lesson.lessonId, ana)).status).toBe(202);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);

    const brunos = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId: lesson.branches.get(bruno.id)!, stage: 'transcription' } },
    });
    expect(brunos).toMatchObject({ status: 'failed', run: 1 });
  }, 60_000);
});

describe('pipeline route access', () => {
  it('rejects_a_non_participant', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);

    for (const response of [await readPipeline(lesson.lessonId, outsider), await retry(lesson.lessonId, outsider)]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CLASS004');
    }
  }, 60_000);

  it('rejects_a_malformed_lesson_id', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');

    for (const response of [await readPipeline('not-a-uuid', ana), await retry('not-a-uuid', ana)]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VAL001');
    }
  }, 60_000);

  it('requires_authentication', async () => {
    const lessonId = '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21';

    for (const response of [
      await http().get(`/lessons/${lessonId}/pipeline`),
      await http().post(`/lessons/${lessonId}/pipeline/retry`),
    ]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH003');
    }
  }, 60_000);
});
