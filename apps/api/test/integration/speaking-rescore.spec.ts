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
  await pipeline.ctx.prisma.credentialUsage.deleteMany();
  await pipeline.ctx.prisma.userCredential.deleteMany();
  await pipeline.ctx.prisma.user.deleteMany();
});

const PASSAGE = Array.from({ length: 12 }, (_, i) => `rescoreword${i}`).join(' ');

function words(count = 12, accuracy = 85) {
  return Array.from({ length: count }, (_, i) => ({ word: `rescoreword${i}`, accuracy }));
}

function upload(ctx: SpeakingTestContext['ctx'], activityId: string, cookie: string, wav: Buffer) {
  return request(ctx.app.getHttpServer())
    .post(`/speaking/activities/${activityId}/attempts`)
    .set('Cookie', cookie)
    .set('Content-Type', 'audio/wav')
    .set(SPEAKING_CLIENT_ATTEMPT_HEADER, randomUUID())
    .send(wav);
}

function rescore(ctx: SpeakingTestContext['ctx'], attemptId: string, cookie: string) {
  return request(ctx.app.getHttpServer()).post(`/speaking/attempts/${attemptId}/rescore`).set('Cookie', cookie);
}

describe('speaking re-score', () => {
  it('a_failed_assessment_is_rescored_without_re_recording', async () => {
    const { ctx } = pipeline;
    const amara = await seedSpeaker(ctx, 'Amara');
    const lessonId = await seedLesson(ctx, [amara.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, amara.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, amara.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    pipeline.pronunciation.script(
      amara.azureKey!,
      PASSAGE,
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 500 },
    );

    const wav = await buildWavFile(6);
    const first = await upload(ctx, activityId, amara.cookie, wav).expect(201);
    expect(first.body.data.state).toBe('failed');
    expect(first.body.data.failure.code).toBe('service_error');
    expect(first.body.data.failure.rescorable).toBe(true);

    pipeline.pronunciation.script(amara.azureKey!, PASSAGE, { kind: 'ok', words: words() });
    const second = await rescore(ctx, first.body.data.id, amara.cookie).expect(200);

    expect(second.body.data.state).toBe('scored');
    expect(pipeline.pronunciation.callsFor(amara.azureKey!)).toHaveLength(4);
  });

  it('a_rejected_key_fails_the_attempt_and_invalidates_the_key', async () => {
    const { ctx } = pipeline;
    const bram = await seedSpeaker(ctx, 'Bram');
    const lessonId = await seedLesson(ctx, [bram.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, bram.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, bram.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    pipeline.pronunciation.script(bram.azureKey!, PASSAGE, { kind: 'status', status: 401 });

    const wav = await buildWavFile(6);
    const response = await upload(ctx, activityId, bram.cookie, wav).expect(201);

    expect(response.body.data.state).toBe('failed');
    expect(response.body.data.failure.code).toBe('azure_key_rejected');
    const credential = await ctx.prisma.userCredential.findUnique({ where: { userId_provider: { userId: bram.id, provider: 'azure_speech' } } });
    expect(credential?.status).toBe('invalid');

    const view = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', bram.cookie).expect(200);
    expect(view.body.data.block).toBe('azure_key_missing');
  });

  it('quota_fails_the_attempt_rescorably', async () => {
    const { ctx } = pipeline;
    const celia = await seedSpeaker(ctx, 'Celia');
    const lessonId = await seedLesson(ctx, [celia.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, celia.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, celia.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    pipeline.pronunciation.script(celia.azureKey!, PASSAGE, { kind: 'status', status: 429 });

    const wav = await buildWavFile(6);
    const response = await upload(ctx, activityId, celia.cookie, wav).expect(201);

    expect(response.body.data.state).toBe('failed');
    expect(response.body.data.failure.code).toBe('azure_quota');
    expect(response.body.data.failure.rescorable).toBe(true);
  });

  it('refused_audio_is_not_rescorable', async () => {
    const { ctx } = pipeline;
    const deshi = await seedSpeaker(ctx, 'Deshi');
    const lessonId = await seedLesson(ctx, [deshi.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, deshi.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, deshi.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    pipeline.pronunciation.script(deshi.azureKey!, PASSAGE, { kind: 'status', status: 415 });

    const wav = await buildWavFile(6);
    const response = await upload(ctx, activityId, deshi.cookie, wav).expect(201);
    expect(response.body.data.failure.code).toBe('audio_rejected');
    expect(response.body.data.failure.rescorable).toBe(false);

    const retry = await rescore(ctx, response.body.data.id, deshi.cookie);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('SPEAK006');
  });

  it('a_rescore_past_the_limit_is_refused', async () => {
    const { ctx } = pipeline;
    const elin = await seedSpeaker(ctx, 'Elin');
    const lessonId = await seedLesson(ctx, [elin.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, elin.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, elin.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    for (let i = 0; i < 3; i++) {
      pipeline.pronunciation.script(elin.azureKey!, PASSAGE, { kind: 'ok', words: words(12, 70 + i) });
    }
    pipeline.pronunciation.script(elin.azureKey!, PASSAGE, { kind: 'status', status: 500 });

    const wav = await buildWavFile(6);
    for (let i = 0; i < 3; i++) {
      await upload(ctx, activityId, elin.cookie, wav).expect(201);
    }
    const failed = await upload(ctx, activityId, elin.cookie, wav);
    expect(failed.status).toBe(409);
    expect(failed.body.error.code).toBe('SPEAK002');
  });

  it('another_users_attempt_is_not_found_for_rescore_or_audio', async () => {
    const { ctx } = pipeline;
    const farai = await seedSpeaker(ctx, 'Farai');
    const gael = await seedSpeaker(ctx, 'Gael');
    const lessonId = await seedLesson(ctx, [farai.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, farai.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, farai.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    pipeline.pronunciation.script(farai.azureKey!, PASSAGE, { kind: 'status', status: 500 });

    const wav = await buildWavFile(6);
    const uploaded = await upload(ctx, activityId, farai.cookie, wav).expect(201);

    const rescoreAttempt = await rescore(ctx, uploaded.body.data.id, gael.cookie);
    expect(rescoreAttempt.status).toBe(404);
    expect(rescoreAttempt.body.error.code).toBe('SPEAK005');

    const audio = await request(ctx.app.getHttpServer()).get(`/speaking/attempts/${uploaded.body.data.id}/audio`).set('Cookie', gael.cookie);
    expect(audio.status).toBe(404);
  });

  it('the_audio_route_streams_the_owners_wav', async () => {
    const { ctx } = pipeline;
    const hanne = await seedSpeaker(ctx, 'Hanne');
    const lessonId = await seedLesson(ctx, [hanne.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, hanne.id, lessonId, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, hanne.id, rootActivityId, { shape: 'read_aloud', referenceText: PASSAGE });
    pipeline.pronunciation.script(hanne.azureKey!, PASSAGE, { kind: 'ok', words: words() });

    const wav = await buildWavFile(6);
    const uploaded = await upload(ctx, activityId, hanne.cookie, wav).expect(201);

    const audio = await request(ctx.app.getHttpServer())
      .get(`/speaking/attempts/${uploaded.body.data.id}/audio`)
      .set('Cookie', hanne.cookie)
      .expect(200);

    expect(audio.headers['content-type']).toContain('audio/wav');
    expect(audio.headers['cache-control']).toContain('no-store');
    expect(Buffer.from(audio.body).equals(wav)).toBe(true);
  });
});
