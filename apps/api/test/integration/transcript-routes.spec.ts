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

interface Utterance {
  id: string;
  userId: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number | null;
  words?: Array<{ text: string; startMs: number; durationMs: number; confidence: number | null }>;
}

function readTranscript(lessonId: string, speaker: Speaker) {
  return request(pipeline.ctx.app.getHttpServer()).get(`/lessons/${lessonId}/transcript`).set('Cookie', speaker.cookie);
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

/** Ana starts recording with the lesson, Bruno 40 seconds in; their speech interleaves in lesson time. */
async function interleavedLesson() {
  const ana = await seedSpeaker(pipeline.ctx, 'Ana');
  const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
  pipeline.speech.script(ana.azureKey!, {
    kind: 'ok',
    phrases: [
      { offsetMs: 30_000, durationMs: 4_000, text: 'Ana speaks first.', confidence: 0.9, words: [{ text: 'Ana', offsetMs: 30_000, durationMs: 400 }] },
      { offsetMs: 50_000, durationMs: 3_000, text: 'Ana answers.', confidence: 0.7, words: [{ text: 'Ana', offsetMs: 50_000, durationMs: 300 }] },
    ],
  });
  pipeline.speech.script(bruno.azureKey!, {
    kind: 'ok',
    phrases: [{ offsetMs: 2_000, durationMs: 5_000, text: 'Bruno replies.', confidence: 0.8, words: [{ text: 'Bruno', offsetMs: 2_000, durationMs: 500 }] }],
  });
  const lesson = await makeRecordedLesson(pipeline, [
    { speaker: ana, recordingOffsetMs: 0 },
    { speaker: bruno, recordingOffsetMs: 40_000 },
  ]);
  await launchAll(pipeline, lesson);
  await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
  await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['completed']);
  return { ana, bruno, lesson };
}

describe('GET /lessons/:lessonId/transcript', () => {
  it('merges_all_participants_chronologically_by_wall_clock', async () => {
    const { ana, bruno, lesson } = await interleavedLesson();

    const response = await readTranscript(lesson.lessonId, ana);

    expect(response.status).toBe(200);
    const utterances = response.body.data.utterances as Utterance[];
    expect(utterances.map((utterance) => [utterance.text, utterance.userId, utterance.startMs, utterance.endMs])).toEqual([
      ['Ana speaks first.', ana.id, 30_000, 34_000],
      // Bruno's file starts 40 s into the lesson: offset 2 s becomes 42 s.
      ['Bruno replies.', bruno.id, 42_000, 47_000],
      ['Ana answers.', ana.id, 50_000, 53_000],
    ]);
    expect(response.body.data.lessonStartedAt).toBe(lesson.startedAt.toISOString());
  }, 60_000);

  it('other_participants_utterances_carry_no_confidence_or_words', async () => {
    const { ana, bruno, lesson } = await interleavedLesson();

    const asAna = (await readTranscript(lesson.lessonId, ana)).body.data.utterances as Utterance[];
    const asBruno = (await readTranscript(lesson.lessonId, bruno)).body.data.utterances as Utterance[];

    for (const utterance of asAna.filter((entry) => entry.userId === bruno.id)) {
      expect(utterance).not.toHaveProperty('confidence');
      expect(utterance).not.toHaveProperty('words');
    }
    for (const utterance of asBruno.filter((entry) => entry.userId === ana.id)) {
      expect(utterance).not.toHaveProperty('confidence');
      expect(utterance).not.toHaveProperty('words');
    }
  }, 60_000);

  it('the_callers_own_utterances_carry_confidence_and_words', async () => {
    const { bruno, lesson } = await interleavedLesson();

    const asBruno = (await readTranscript(lesson.lessonId, bruno)).body.data.utterances as Utterance[];
    const own = asBruno.find((entry) => entry.userId === bruno.id)!;

    expect(own.confidence).toBeCloseTo(0.8, 5);
    // Word timings are in lesson time too.
    expect(own.words).toEqual([{ text: 'Bruno', startMs: 42_000, durationMs: 500, confidence: null }]);
  }, 60_000);

  it('a_transcript_is_readable_before_later_stages_finish', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);
    await launchAll(pipeline, lesson);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({
      where: { id: lesson.branches.get(ana.id)! },
    });
    expect(branch).toMatchObject({ stage: 'excerpt_selection', status: 'queued' });

    const response = await readTranscript(lesson.lessonId, ana);

    expect(response.status).toBe(200);
    expect(response.body.data.utterances).toHaveLength(2);
  }, 60_000);

  it('reports_each_speakers_coarse_status', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withKey: false });
    const carla = await seedSpeaker(pipeline.ctx, 'Carla');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }, { speaker: bruno }, { speaker: carla }]);
    await pipeline.ctx.prisma.lessonPipelineBranch.update({
      where: { id: lesson.branches.get(carla.id)! },
      data: { stage: 'recording', status: 'failed', failureCode: 'recording_missing', failureReason: 'Recording is empty or missing.', launchedAt: null },
    });
    await launchAll(pipeline, { ...lesson, branches: new Map([...lesson.branches].filter(([id]) => id !== carla.id)) });
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'transcription', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'transcription', ['blocked_missing_key']);

    const response = await readTranscript(lesson.lessonId, ana);

    const speakers = response.body.data.speakers as Array<Record<string, unknown>>;
    expect(speakers).toHaveLength(3);
    expect(speakers).toEqual(
      expect.arrayContaining([
        { userId: ana.id, displayName: 'Ana', isMe: true, status: 'available' },
        { userId: bruno.id, displayName: 'Bruno', isMe: false, status: 'pending' },
        { userId: carla.id, displayName: 'Carla', isMe: false, status: 'unavailable' },
      ]),
    );
    const body = JSON.stringify(response.body);
    for (const leaked of ['credential_missing', 'recording_missing', 'Recording is empty or missing.', 'blocked', 'azure_speech']) {
      expect(body).not.toContain(leaked);
    }
  }, 60_000);

  it('rejects_a_non_participant', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider');
    const lesson = await makeRecordedLesson(pipeline, [{ speaker: ana }]);

    const response = await readTranscript(lesson.lessonId, outsider);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CLASS004');
  }, 60_000);

  it('rejects_a_malformed_lesson_id', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');

    const response = await readTranscript('not-a-uuid', ana);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VAL001');
  }, 60_000);

  it('requires_authentication', async () => {
    const response = await request(pipeline.ctx.app.getHttpServer()).get(
      '/lessons/9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21/transcript',
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH003');
  }, 60_000);
});
