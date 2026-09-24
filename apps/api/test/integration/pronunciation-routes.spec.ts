import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { audioObjectKey } from '../../src/recording/recording.constants';
import {
  createPipelineTestContext,
  makeTranscribedLesson,
  resetPipelineTables,
  seedSpeaker,
  startSelection,
  uploadAudio,
  waitForStage,
  type PipelineTestContext,
  type SeedUtterance,
  type Speaker,
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

beforeAll(async () => {
  pipeline = await createPipelineTestContext();
}, 240_000);

afterAll(async () => {
  await pipeline?.close();
});

beforeEach(async () => {
  pipeline.speech.reset();
  pipeline.pronunciation.reset();
  await resetPipelineTables(pipeline.ctx);
});

function http() {
  return request(pipeline.ctx.app.getHttpServer());
}

function readPronunciation(lessonId: string, speaker: Speaker) {
  return http().get(`/lessons/${lessonId}/pronunciation`).set('Cookie', speaker.cookie);
}

function turn(index: number, startMs: number, durationMs: number, confidence = 0.6): SeedUtterance {
  return {
    startMs,
    endMs: startMs + durationMs,
    text: `Turn number ${index} has quite a few words spoken carefully today`,
    confidence,
  };
}

/** `count` turns, at most 3 per F09's 5-minute window — no competition, everything gets selected. */
function turns(count: number, durationMs = 15_000): SeedUtterance[] {
  const result: SeedUtterance[] = [];
  let minute = 0;
  while (result.length < count) {
    for (let slot = 0; slot < 3 && result.length < count; slot += 1) {
      const startMs = minute * 60_000 + slot * (durationMs + 5_000);
      result.push(turn(result.length + 1, startMs, durationMs, 0.55 + 0.02 * result.length));
    }
    minute += 6;
  }
  return result;
}

/** A branch with `count` selected excerpts and real short audio, ready for F10 to pick up. */
async function selectedLesson(count: number, speakerName: string, options: { withKey?: boolean } = {}) {
  const speaker = await seedSpeaker(pipeline.ctx, speakerName, { withKey: options.withKey });
  const lesson = await makeTranscribedLesson(pipeline, [{ speaker, utterances: turns(count) }]);
  const branchId = lesson.branches.get(speaker.id)!;
  await uploadAudio(pipeline.storage, audioObjectKey(lesson.lessonId, speaker.id), 60);

  await startSelection(pipeline, branchId);
  await waitForStage(pipeline.ctx, branchId, 'excerpt_selection', ['completed']);
  const excerpts = await pipeline.ctx.prisma.lessonExcerpt.findMany({
    where: { lessonId: lesson.lessonId, userId: speaker.id },
    orderBy: { rank: 'asc' },
  });

  return { speaker, lesson, branchId, excerpts };
}

describe('GET /lessons/:lessonId/pronunciation', () => {
  it('returns_the_callers_result_with_notes_and_excerpts', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(3, 'Ana');
    pipeline.pronunciation.script(
      speaker.azureKey!,
      excerpts[1]!.referenceText,
      { kind: 'status', status: 503 },
      { kind: 'status', status: 503 },
      { kind: 'status', status: 503 },
    );

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const response = await readPronunciation(lesson.lessonId, speaker);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.status).toBe('assessed');
    expect(data.result.excerptCount).toBe(3);
    expect(data.result.assessedCount).toBe(2);
    expect(data.result.partialAssessment).toBe(true);
    expect(data.result.sparsePronunciationSample).toBe(true);
    expect(data.result.notes).toEqual([
      'Based on only 2 excerpts — this score is less reliable than usual.',
      'Based on 2 of 3 excerpts; some could not be assessed.',
    ]);
    expect(data.excerpts).toHaveLength(3);
    for (const excerpt of data.excerpts) {
      expect(['assessed', 'not_assessed']).toContain(excerpt.pronunciation.status);
    }
    const failed = data.excerpts.find((e: { excerptId: string }) => e.excerptId === excerpts[1]!.id);
    expect(failed.pronunciation).toEqual({ status: 'not_assessed', scores: null });
  }, 60_000);

  it('reports_each_status_truthfully', async () => {
    // pending: selection queued, F10 never reached.
    const pendingAna = await seedSpeaker(pipeline.ctx, 'PendingAna');
    const pendingLesson = await makeTranscribedLesson(pipeline, [{ speaker: pendingAna, utterances: turns(2) }]);

    // blocked (reads pending): excerpts selected, no Azure key.
    const blocked = await selectedLesson(2, 'BlockedBruno', { withKey: false });
    await waitForStage(pipeline.ctx, blocked.branchId, 'pronunciation_assessment', ['blocked_missing_key']);

    // failed: audio never uploaded, so F10 fails without retry.
    const failedCarla = await seedSpeaker(pipeline.ctx, 'FailedCarla');
    const failedLesson = await makeTranscribedLesson(pipeline, [{ speaker: failedCarla, utterances: turns(2) }]);
    const failedBranchId = failedLesson.branches.get(failedCarla.id)!;
    await startSelection(pipeline, failedBranchId);
    await waitForStage(pipeline.ctx, failedBranchId, 'excerpt_selection', ['completed']);
    await waitForStage(pipeline.ctx, failedBranchId, 'pronunciation_assessment', ['failed']);

    // no_sample: nothing eligible.
    const noSampleDaniel = await seedSpeaker(pipeline.ctx, 'NoSampleDaniel');
    const noSampleLesson = await makeTranscribedLesson(pipeline, [
      { speaker: noSampleDaniel, utterances: [{ startMs: 0, endMs: 1_200, text: 'Yeah, right.', confidence: 0.9 }] },
    ]);
    const noSampleBranchId = noSampleLesson.branches.get(noSampleDaniel.id)!;
    await startSelection(pipeline, noSampleBranchId);
    await waitForStage(pipeline.ctx, noSampleBranchId, 'pronunciation_assessment', ['completed']);

    // unavailable: a participant with no pipeline branch at all.
    const unavailableEve = await seedSpeaker(pipeline.ctx, 'UnavailableEve');
    await pipeline.ctx.prisma.lessonParticipant.create({
      data: {
        lessonId: noSampleLesson.lessonId,
        userId: unavailableEve.id,
        identity: unavailableEve.id,
        joinedAt: new Date(),
        connected: false,
      },
    });

    const pending = await readPronunciation(pendingLesson.lessonId, pendingAna);
    expect(pending.body.data).toMatchObject({ status: 'pending', result: null });

    const blockedResponse = await readPronunciation(blocked.lesson.lessonId, blocked.speaker);
    expect(blockedResponse.body.data).toMatchObject({ status: 'pending', result: null });

    const failed = await readPronunciation(failedLesson.lessonId, failedCarla);
    expect(failed.body.data).toMatchObject({ status: 'failed', result: null });

    const noSample = await readPronunciation(noSampleLesson.lessonId, noSampleDaniel);
    expect(noSample.body.data).toMatchObject({ status: 'no_sample', result: null });

    const unavailable = await readPronunciation(noSampleLesson.lessonId, unavailableEve);
    expect(unavailable.body.data).toMatchObject({ status: 'unavailable', result: null, excerpts: [] });
  }, 90_000);

  it('never_returns_another_participants_pronunciation', async () => {
    const a = await selectedLesson(2, 'Ana');
    await waitForStage(pipeline.ctx, a.branchId, 'pronunciation_assessment', ['completed']);
    const b = await selectedLesson(2, 'Bruno');
    await waitForStage(pipeline.ctx, b.branchId, 'pronunciation_assessment', ['completed']);

    const asAna = JSON.stringify((await readPronunciation(a.lesson.lessonId, a.speaker)).body);
    expect(asAna).not.toContain(b.speaker.id);
    for (const excerpt of b.excerpts) {
      expect(asAna).not.toContain(excerpt.id);
      expect(asAna).not.toContain(excerpt.utteranceId);
    }
  }, 60_000);

  it('badges_carry_the_same_scores_as_the_section', async () => {
    const { speaker, lesson, branchId } = await selectedLesson(2, 'Ana');
    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);

    const pronunciationView = (await readPronunciation(lesson.lessonId, speaker)).body.data;
    const transcript = await http().get(`/lessons/${lesson.lessonId}/transcript`).set('Cookie', speaker.cookie);

    const badgeByUtteranceId = new Map(
      (transcript.body.data.utterances as Array<{ id: string; excerpt?: { pronunciation: unknown } }>)
        .filter((u) => u.excerpt)
        .map((u) => [u.id, u.excerpt!.pronunciation]),
    );
    expect(badgeByUtteranceId.size).toBe(2);
    for (const excerpt of pronunciationView.excerpts as Array<{ utteranceId: string; pronunciation: unknown }>) {
      expect(badgeByUtteranceId.get(excerpt.utteranceId)).toEqual(excerpt.pronunciation);
    }
  }, 60_000);

  it('the_pipeline_view_shows_progress', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(3, 'Ana');
    for (const excerpt of excerpts) {
      pipeline.pronunciation.script(speaker.azureKey!, excerpt.referenceText, { kind: 'wait', ms: 200, then: { kind: 'ok' } });
    }

    let sawProgress = false;
    const started = Date.now();
    while (Date.now() - started < 15_000) {
      const view = await http().get(`/lessons/${lesson.lessonId}/pipeline`).set('Cookie', speaker.cookie);
      const stages = view.body.data.branch.stages as Array<{ stage: string; progress: { done: number; total: number } | null }>;
      const pronunciationStage = stages.find((s) => s.stage === 'pronunciation_assessment')!;
      const others = stages.filter((s) => s.stage !== 'pronunciation_assessment');
      if (pronunciationStage.progress && pronunciationStage.progress.total === 3) {
        sawProgress = true;
        expect(others.every((s) => s.progress === null)).toBe(true);
        if (pronunciationStage.progress.done === 3) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(sawProgress).toBe(true);

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);
    const final = await http().get(`/lessons/${lesson.lessonId}/pipeline`).set('Cookie', speaker.cookie);
    const finalStages = final.body.data.branch.stages as Array<{ stage: string; progress: { done: number; total: number } | null }>;
    expect(finalStages.find((s) => s.stage === 'pronunciation_assessment')!.progress).toEqual({ done: 3, total: 3 });
  }, 60_000);

  it('retry_of_a_failed_assessment_requeues_it', async () => {
    const { speaker, lesson, branchId, excerpts } = await selectedLesson(3, 'Ana');
    for (const excerpt of excerpts.slice(0, 2)) {
      pipeline.pronunciation.script(
        speaker.azureKey!,
        excerpt.referenceText,
        { kind: 'status', status: 503 },
        { kind: 'status', status: 503 },
        { kind: 'status', status: 503 },
      );
    }
    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['failed']);

    pipeline.pronunciation.reset();
    const retried = await http().post(`/lessons/${lesson.lessonId}/pipeline/retry`).set('Cookie', speaker.cookie);
    expect(retried.status).toBe(202);
    const requeued = await pipeline.ctx.prisma.lessonPipelineStage.findUniqueOrThrow({
      where: { branchId_stage: { branchId, stage: 'pronunciation_assessment' } },
    });
    expect(requeued.run).toBe(2);
    expect(requeued.progressDone).toBeNull();
    expect(requeued.progressTotal).toBeNull();

    await waitForStage(pipeline.ctx, branchId, 'pronunciation_assessment', ['completed']);
    const view = await readPronunciation(lesson.lessonId, speaker);
    expect(view.body.data.status).toBe('assessed');
    expect(view.body.data.result.assessedCount).toBe(3);
  }, 60_000);

  it('rejects_a_non_participant', async () => {
    const { lesson } = await selectedLesson(1, 'Ana');
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider');

    const response = await readPronunciation(lesson.lessonId, outsider);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CLASS004');
  }, 60_000);

  it('rejects_a_malformed_lesson_id', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const response = await http().get('/lessons/not-a-uuid/pronunciation').set('Cookie', ana.cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VAL001');
  }, 60_000);

  it('requires_authentication', async () => {
    const { lesson } = await selectedLesson(1, 'Ana');
    const response = await http().get(`/lessons/${lesson.lessonId}/pronunciation`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH003');
  }, 60_000);
});
