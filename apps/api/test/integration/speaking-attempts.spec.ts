import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SPEAKING_CLIENT_ATTEMPT_HEADER } from '@english-quest/shared';

import { seedLesson, seedSpeaker } from './helpers/pipeline-fixtures';
import {
  buildWavFile,
  createSpeakingTestContext,
  seedSpeakingActivity,
  seedSpeakingTask,
  type SpeakingTestContext,
} from './helpers/speaking-fixtures';

let pipeline: SpeakingTestContext;

beforeAll(async () => {
  pipeline = await createSpeakingTestContext();
}, 180_000);

afterAll(async () => {
  await pipeline?.close();
});

afterEach(async () => {
  pipeline.speech.reset();
  pipeline.pronunciation.reset();
  await pipeline.ctx.prisma.speakingAttempt.deleteMany();
  await pipeline.ctx.prisma.speakingTask.deleteMany();
  await pipeline.ctx.prisma.studyPlanActivity.deleteMany();
  await pipeline.ctx.prisma.studyPlan.deleteMany();
  await pipeline.ctx.prisma.lesson.deleteMany();
  await pipeline.ctx.prisma.profileSource.deleteMany();
  await pipeline.ctx.prisma.errorLedgerOccurrence.deleteMany();
  await pipeline.ctx.prisma.errorLedgerEntry.deleteMany();
  await pipeline.ctx.prisma.credentialUsage.deleteMany();
  await pipeline.ctx.prisma.userCredential.deleteMany();
  await pipeline.ctx.prisma.user.deleteMany();
});

const READ_ALOUD_PASSAGE = Array.from({ length: 12 }, (_, i) => `wordtwelve${i}`).join(' ');

function readAloudWords(count: number, accuracy = 85) {
  return Array.from({ length: count }, (_, i) => ({ word: `wordtwelve${i}`, accuracy }));
}

function upload(ctx: SpeakingTestContext['ctx'], activityId: string, cookie: string, wav: Buffer, clientAttemptId = randomUUID()) {
  return request(ctx.app.getHttpServer())
    .post(`/speaking/activities/${activityId}/attempts`)
    .set('Cookie', cookie)
    .set('Content-Type', 'audio/wav')
    .set(SPEAKING_CLIENT_ATTEMPT_HEADER, clientAttemptId)
    .send(wav);
}

describe('speaking attempts', () => {
  it('stores_the_recording_under_the_activity_and_user_prefix', async () => {
    const { ctx, storage } = pipeline;
    const amara = await seedSpeaker(ctx, 'Amara');
    const lessonId = await seedLesson(ctx, [amara.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, amara.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, amara.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    pipeline.pronunciation.script(amara.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(12) });

    const wav = await buildWavFile(5);
    const response = await upload(ctx, activityId, amara.cookie, wav).expect(201);

    const attemptId = response.body.data.id as string;
    const expectedKey = `activities/${activityId}/${amara.id}/${attemptId}/audio.wav`;
    const stored = await storage.getObject(expectedKey);
    expect(stored.equals(wav)).toBe(true);
  });

  it('rejects_a_recording_that_is_not_16khz_mono_wav', async () => {
    const { ctx } = pipeline;
    const bram = await seedSpeaker(ctx, 'Bram');
    const lessonId = await seedLesson(ctx, [bram.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, bram.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, bram.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });

    const notWav = Buffer.from('this is not a wav file at all, padded to be long enough');
    const response = await upload(ctx, activityId, bram.cookie, notWav);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SPEAK003');
    expect(await ctx.prisma.speakingAttempt.count({ where: { userId: bram.id } })).toBe(0);
  });

  it('rejects_a_recording_longer_than_two_minutes', async () => {
    const { ctx } = pipeline;
    const celia = await seedSpeaker(ctx, 'Celia');
    const lessonId = await seedLesson(ctx, [celia.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, celia.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, celia.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });

    const tooLong = await buildWavFile(125);
    const response = await upload(ctx, activityId, celia.cookie, tooLong);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('SPEAK004');
    expect(await ctx.prisma.speakingAttempt.count({ where: { userId: celia.id } })).toBe(0);
  });

  it('read_aloud_is_scored_through_the_shared_clip_capability_with_the_same_score_set', async () => {
    const { ctx } = pipeline;
    const deshi = await seedSpeaker(ctx, 'Deshi');
    const lessonId = await seedLesson(ctx, [deshi.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, deshi.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, deshi.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    pipeline.pronunciation.script(deshi.azureKey!, READ_ALOUD_PASSAGE, {
      kind: 'ok',
      scores: { pronunciation: 77, accuracy: 80, fluency: 75, prosody: 70, completeness: 95 },
      words: readAloudWords(12),
    });

    const wav = await buildWavFile(8);
    const response = await upload(ctx, activityId, deshi.cookie, wav).expect(201);

    expect(response.body.data.state).toBe('scored');
    expect(response.body.data.result.scores).toEqual({ pronunciation: 77, accuracy: 80, fluency: 75, prosody: 70, completeness: 95 });
    expect(pipeline.pronunciation.callsFor(deshi.azureKey!)).toHaveLength(1);
    expect(pipeline.speech.callsFor(deshi.azureKey!)).toHaveLength(0);
  });

  it('open_response_is_transcribed_first_and_assessed_against_its_transcript', async () => {
    const { ctx } = pipeline;
    const elin = await seedSpeaker(ctx, 'Elin');
    const lessonId = await seedLesson(ctx, [elin.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, elin.id, lessonId, { kind: 'speaking' });
    await seedSpeakingTask(ctx, elin.id, rootActivityId, { shape: 'open_response', prompt: 'Tell me about a challenge.' });

    const words = Array.from({ length: 12 }, (_, i) => ({ text: `spoken${i}`, offsetMs: i * 500, durationMs: 400 }));
    const transcript = words.map((w) => w.text).join(' ');
    pipeline.speech.script(elin.azureKey!, { kind: 'ok', phrases: [{ offsetMs: 0, durationMs: 6_000, text: transcript, words }] });
    pipeline.pronunciation.script(elin.azureKey!, transcript, { kind: 'ok', words: words.map((w) => ({ word: w.text, accuracy: 88 })) });

    const wav = await buildWavFile(10);
    const response = await upload(ctx, activityId, elin.cookie, wav).expect(201);

    expect(response.body.data.state).toBe('scored');
    expect(response.body.data.result.transcript).toBe(transcript);
    expect(pipeline.speech.callsFor(elin.azureKey!)).toHaveLength(1);
    expect(pipeline.pronunciation.callsFor(elin.azureKey!)).toHaveLength(1);
  });

  it('fewer_than_ten_words_discards_the_attempt_without_counting_or_scoring', async () => {
    const { ctx } = pipeline;
    const farai = await seedSpeaker(ctx, 'Farai');
    const lessonId = await seedLesson(ctx, [farai.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, farai.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, farai.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    pipeline.pronunciation.script(farai.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(8) });

    const wav = await buildWavFile(5);
    const response = await upload(ctx, activityId, farai.cookie, wav).expect(201);

    expect(response.body.data.state).toBe('discarded');
    expect(response.body.data.failure.code).toBe('not_enough_speech');
    const view = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', farai.cookie).expect(200);
    expect(view.body.data.attemptsUsed).toBe(0);
    expect(await ctx.prisma.profileSource.count({ where: { userId: farai.id } })).toBe(0);
  });

  it('a_fourth_attempt_is_refused', async () => {
    const { ctx } = pipeline;
    const gael = await seedSpeaker(ctx, 'Gael');
    const lessonId = await seedLesson(ctx, [gael.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, gael.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, gael.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    for (let i = 0; i < 3; i++) {
      pipeline.pronunciation.script(gael.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(12, 70 + i) });
    }
    const wav = await buildWavFile(6);
    for (let i = 0; i < 3; i++) {
      await upload(ctx, activityId, gael.cookie, wav).expect(201);
    }

    const fourth = await upload(ctx, activityId, gael.cookie, wav);
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('SPEAK002');
  });

  it('every_attempt_is_retained_and_replayable', async () => {
    const { ctx } = pipeline;
    const hanne = await seedSpeaker(ctx, 'Hanne');
    const lessonId = await seedLesson(ctx, [hanne.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, hanne.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, hanne.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    for (let i = 0; i < 3; i++) {
      pipeline.pronunciation.script(hanne.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(12, 70 + i) });
    }
    const wav = await buildWavFile(6);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await upload(ctx, activityId, hanne.cookie, wav).expect(201);
      ids.push(response.body.data.id);
    }

    for (const id of ids) {
      const audio = await request(ctx.app.getHttpServer()).get(`/speaking/attempts/${id}/audio`).set('Cookie', hanne.cookie).expect(200);
      expect(Buffer.from(audio.body).equals(wav)).toBe(true);
    }
  });

  it('the_best_attempt_counts_toward_the_profile', async () => {
    const { ctx } = pipeline;
    const ivo = await seedSpeaker(ctx, 'Ivo');
    const lessonId = await seedLesson(ctx, [ivo.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, ivo.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, ivo.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    const scores = [70, 64, 81];
    for (const pronunciation of scores) {
      pipeline.pronunciation.script(ivo.azureKey!, READ_ALOUD_PASSAGE, {
        kind: 'ok',
        scores: { pronunciation, accuracy: pronunciation, fluency: pronunciation, prosody: pronunciation, completeness: 95 },
        words: readAloudWords(12),
      });
    }
    const wav = await buildWavFile(6);
    let bestAttemptId = '';
    for (const expected of scores) {
      const response = await upload(ctx, activityId, ivo.cookie, wav).expect(201);
      if (expected === 81) {
        bestAttemptId = response.body.data.id;
      }
    }

    const sources = await ctx.prisma.profileSource.findMany({ where: { userId: ivo.id } });
    expect(sources).toHaveLength(1);
    expect(sources[0]!.revision).toBe(bestAttemptId);
    const measurement = await ctx.prisma.profileMeasurement.findFirst({ where: { sourceId: sources[0]!.id, competency: 'pronunciation' } });
    expect(measurement?.value).toBe(81);
  });

  it('the_first_upload_starts_and_the_first_score_completes_the_plan_activity', async () => {
    const { ctx } = pipeline;
    const juno = await seedSpeaker(ctx, 'Juno');
    const lessonId = await seedLesson(ctx, [juno.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, juno.id, lessonId, { kind: 'pronunciation', state: 'pending' });
    await seedSpeakingTask(ctx, juno.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    pipeline.pronunciation.script(juno.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(5) }); // discarded: fewer than 10

    const wav = await buildWavFile(4);
    await upload(ctx, activityId, juno.cookie, wav).expect(201);
    const afterDiscard = await ctx.prisma.studyPlanActivity.findUnique({ where: { id: activityId } });
    expect(afterDiscard?.state).toBe('in_progress');

    pipeline.pronunciation.script(juno.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(12) });
    await upload(ctx, activityId, juno.cookie, wav).expect(201);
    const afterScore = await ctx.prisma.studyPlanActivity.findUnique({ where: { id: activityId } });
    expect(afterScore?.state).toBe('completed');
  });

  it('a_replayed_client_attempt_id_returns_the_stored_attempt', async () => {
    const { ctx } = pipeline;
    const kofi = await seedSpeaker(ctx, 'Kofi');
    const lessonId = await seedLesson(ctx, [kofi.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, kofi.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, kofi.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    pipeline.pronunciation.script(kofi.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(12) });

    const clientAttemptId = randomUUID();
    const wav = await buildWavFile(6);
    const first = await upload(ctx, activityId, kofi.cookie, wav, clientAttemptId).expect(201);
    const second = await upload(ctx, activityId, kofi.cookie, wav, clientAttemptId).expect(200);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(pipeline.pronunciation.callsFor(kofi.azureKey!)).toHaveLength(1);
  });

  it('an_upload_without_a_usable_key_is_refused_before_anything_is_stored', async () => {
    const { ctx } = pipeline;
    const lior = await seedSpeaker(ctx, 'Lior', { withKey: true });
    const lessonId = await seedLesson(ctx, [lior.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, lior.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, lior.id, rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    await ctx.prisma.userCredential.deleteMany({ where: { userId: lior.id, provider: 'azure_speech' } });

    const wav = await buildWavFile(6);
    const response = await upload(ctx, activityId, lior.cookie, wav);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CRED002');
    expect(await ctx.prisma.speakingAttempt.count({ where: { userId: lior.id } })).toBe(0);
  });

  it('uses_only_the_owners_azure_key_and_audits_the_f18_labels', async () => {
    const { ctx } = pipeline;
    const mina = await seedSpeaker(ctx, 'Mina');
    const noor = await seedSpeaker(ctx, 'Noor');
    const lessonA = await seedLesson(ctx, [mina.id], new Date());
    const lessonB = await seedLesson(ctx, [noor.id], new Date());
    const seededA = await seedSpeakingActivity(ctx, mina.id, lessonA, { kind: 'pronunciation' });
    const seededB = await seedSpeakingActivity(ctx, noor.id, lessonB, { kind: 'speaking' });
    await seedSpeakingTask(ctx, mina.id, seededA.rootActivityId, { shape: 'read_aloud', referenceText: READ_ALOUD_PASSAGE });
    await seedSpeakingTask(ctx, noor.id, seededB.rootActivityId, { shape: 'open_response', prompt: 'Describe something.' });

    pipeline.pronunciation.script(mina.azureKey!, READ_ALOUD_PASSAGE, { kind: 'ok', words: readAloudWords(12) });
    const words = Array.from({ length: 11 }, (_, i) => ({ text: `talk${i}`, offsetMs: i * 400, durationMs: 300 }));
    const transcript = words.map((w) => w.text).join(' ');
    pipeline.speech.script(noor.azureKey!, { kind: 'ok', phrases: [{ offsetMs: 0, durationMs: 5_000, text: transcript, words }] });
    pipeline.pronunciation.script(noor.azureKey!, transcript, { kind: 'ok', words: words.map((w) => ({ word: w.text, accuracy: 90 })) });

    const wav = await buildWavFile(6);
    await upload(ctx, seededA.activityId, mina.cookie, wav).expect(201);
    await upload(ctx, seededB.activityId, noor.cookie, wav).expect(201);

    expect(pipeline.pronunciation.calls.every((call) => call.key === mina.azureKey || call.key === noor.azureKey)).toBe(true);
    const minaUsage = await ctx.prisma.credentialUsage.findMany({ where: { userId: mina.id, feature: 'F18_read_aloud' } });
    expect(minaUsage.length).toBeGreaterThan(0);
    const noorUsage = await ctx.prisma.credentialUsage.findMany({ where: { userId: noor.id, feature: 'F18_open_response' } });
    expect(noorUsage.length).toBeGreaterThan(0);
  });
});
