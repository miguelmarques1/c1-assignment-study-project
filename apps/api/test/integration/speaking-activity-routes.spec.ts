import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { seedLesson, seedSpeaker } from './helpers/pipeline-fixtures';
import { createSpeakingTestContext, seedSpeakingActivity, seedSpeakingTask, type SpeakingTestContext } from './helpers/speaking-fixtures';

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

describe('speaking activity routes', () => {
  it('a_read_aloud_activity_presents_a_25_to_60_word_reference_text', async () => {
    const { ctx } = pipeline;
    const amara = await seedSpeaker(ctx, 'Amara', { withKey: false });
    const lessonId = await seedLesson(ctx, [amara.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, amara.id, lessonId, { kind: 'pronunciation', targetTags: ['phoneme:/θ/'] });
    const passage = Array.from({ length: 30 }, () => 'think').join(' ');
    await seedSpeakingTask(ctx, amara.id, rootActivityId, { shape: 'read_aloud', referenceText: passage, targetTags: ['phoneme:/θ/'], focusTags: ['phoneme:/θ/'] });

    const response = await request(ctx.app.getHttpServer())
      .get(`/speaking/activities/${activityId}`)
      .set('Cookie', amara.cookie)
      .expect(200);

    expect(response.body.data.task.shape).toBe('read_aloud');
    expect(response.body.data.task.wordCount).toBe(30);
    expect(response.body.data.task.referenceText).toBe(passage);
    expect(response.body.data.task.focusTags).toEqual([{ tag: 'phoneme:/θ/', label: expect.any(String) }]);
  });

  it('an_open_response_activity_presents_a_prompt', async () => {
    const { ctx } = pipeline;
    const bram = await seedSpeaker(ctx, 'Bram', { withKey: false });
    const lessonId = await seedLesson(ctx, [bram.id], new Date());
    const { activityId, rootActivityId } = await seedSpeakingActivity(ctx, bram.id, lessonId, { kind: 'speaking' });
    await seedSpeakingTask(ctx, bram.id, rootActivityId, { shape: 'open_response', prompt: 'Describe a recent challenge at work.' });

    const response = await request(ctx.app.getHttpServer())
      .get(`/speaking/activities/${activityId}`)
      .set('Cookie', bram.cookie)
      .expect(200);

    expect(response.body.data.task.shape).toBe('open_response');
    expect(response.body.data.task.prompt).toBe('Describe a recent challenge at work.');
    expect(response.body.data.task.targetSeconds).toEqual({ min: 30, max: 90 });
  });

  it('reading_twice_materializes_one_task', async () => {
    const { ctx } = pipeline;
    const celia = await seedSpeaker(ctx, 'Celia', { withKey: false });
    const lessonId = await seedLesson(ctx, [celia.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, celia.id, lessonId, { kind: 'pronunciation' });

    await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', celia.cookie).expect(200);
    const second = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', celia.cookie).expect(200);

    const tasks = await ctx.prisma.speakingTask.findMany({ where: { userId: celia.id } });
    expect(tasks).toHaveLength(1);
    expect(second.body.data.task.referenceText).toBe(tasks[0]!.referenceText);
  });

  it('a_carried_activity_keeps_its_task_and_attempts', async () => {
    const { ctx } = pipeline;
    const deshi = await seedSpeaker(ctx, 'Deshi', { withKey: false });
    const lessonId = await seedLesson(ctx, [deshi.id], new Date());
    const original = await seedSpeakingActivity(ctx, deshi.id, lessonId, { kind: 'pronunciation', planStatus: 'archived' });
    const carried = await seedSpeakingActivity(ctx, deshi.id, lessonId, { kind: 'pronunciation', carriedFromActivityId: original.activityId });
    const passage = Array.from({ length: 28 }, () => 'carry').join(' ');
    await seedSpeakingTask(ctx, deshi.id, carried.rootActivityId, { shape: 'read_aloud', referenceText: passage });

    const viaOld = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${original.activityId}`).set('Cookie', deshi.cookie).expect(200);
    const viaNew = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${carried.activityId}`).set('Cookie', deshi.cookie).expect(200);

    expect(viaOld.body.data.task.referenceText).toBe(passage);
    expect(viaNew.body.data.task.referenceText).toBe(passage);
    expect(viaOld.body.data.activityId).toBe(carried.activityId);
  });

  it('reading_does_not_change_plan_state', async () => {
    const { ctx } = pipeline;
    const elin = await seedSpeaker(ctx, 'Elin', { withKey: false });
    const lessonId = await seedLesson(ctx, [elin.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, elin.id, lessonId, { kind: 'pronunciation', state: 'pending' });

    const response = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', elin.cookie).expect(200);

    expect(response.body.data.state).toBe('pending');
  });

  it('a_missing_azure_key_blocks_the_activity_before_recording', async () => {
    const { ctx } = pipeline;
    const farai = await seedSpeaker(ctx, 'Farai', { withKey: false });
    const lessonId = await seedLesson(ctx, [farai.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, farai.id, lessonId, { kind: 'pronunciation' });

    const response = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', farai.cookie).expect(200);
    expect(response.body.data.block).toBe('azure_key_missing');

    const gael = await seedSpeaker(ctx, 'Gael', { withKey: true, status: 'invalid' });
    const lessonId2 = await seedLesson(ctx, [gael.id], new Date());
    const activity2 = await seedSpeakingActivity(ctx, gael.id, lessonId2, { kind: 'pronunciation' });
    const invalidResponse = await request(ctx.app.getHttpServer())
      .get(`/speaking/activities/${activity2.activityId}`)
      .set('Cookie', gael.cookie)
      .expect(200);
    expect(invalidResponse.body.data.block).toBe('azure_key_missing');
  });

  it('an_archived_activity_is_read_only', async () => {
    const { ctx } = pipeline;
    const hanne = await seedSpeaker(ctx, 'Hanne', { withKey: false });
    const lessonId = await seedLesson(ctx, [hanne.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, hanne.id, lessonId, { kind: 'pronunciation', planStatus: 'archived' });

    const response = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', hanne.cookie).expect(200);

    expect(response.body.data.block).toBe('plan_archived');
    expect(response.body.data.task).toBeNull();
    expect(await ctx.prisma.speakingTask.count({ where: { userId: hanne.id } })).toBe(0);
  });

  it('a_non_speaking_activity_is_not_found', async () => {
    const { ctx } = pipeline;
    const ivo = await seedSpeaker(ctx, 'Ivo', { withKey: false });
    const lessonId = await seedLesson(ctx, [ivo.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, ivo.id, lessonId, { kind: 'pronunciation' });
    await ctx.prisma.studyPlanActivity.update({ where: { id: activityId }, data: { kind: 'listening' } });

    const response = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', ivo.cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SPEAK001');
  });

  it('another_users_activity_is_not_found', async () => {
    const { ctx } = pipeline;
    const juno = await seedSpeaker(ctx, 'Juno', { withKey: false });
    const kofi = await seedSpeaker(ctx, 'Kofi', { withKey: false });
    const lessonId = await seedLesson(ctx, [juno.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, juno.id, lessonId, { kind: 'pronunciation' });

    const response = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${activityId}`).set('Cookie', kofi.cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PLAN003');
  });

  it('rating_a_completed_activity_is_stored_on_the_plan', async () => {
    const { ctx } = pipeline;
    const lior = await seedSpeaker(ctx, 'Lior', { withKey: false });
    const lessonId = await seedLesson(ctx, [lior.id], new Date());
    const { activityId } = await seedSpeakingActivity(ctx, lior.id, lessonId, { kind: 'pronunciation', state: 'completed' });

    const response = await request(ctx.app.getHttpServer())
      .put(`/speaking/activities/${activityId}/rating`)
      .set('Cookie', lior.cookie)
      .send({ rating: 'just_right', notUseful: false })
      .expect(200);

    expect(response.body.data).toEqual({ rating: 'just_right', notUseful: false });
    const row = await ctx.prisma.studyPlanActivity.findUnique({ where: { id: activityId } });
    expect(row?.difficultyRating).toBe('just_right');
  });

  it('no_response_carries_another_participants_data', async () => {
    const { ctx } = pipeline;
    const mina = await seedSpeaker(ctx, 'Mina', { withKey: false });
    const noor = await seedSpeaker(ctx, 'Noor', { withKey: false });
    const lessonA = await seedLesson(ctx, [mina.id], new Date());
    const lessonB = await seedLesson(ctx, [noor.id], new Date());
    const seededA = await seedSpeakingActivity(ctx, mina.id, lessonA, { kind: 'pronunciation' });
    const seededB = await seedSpeakingActivity(ctx, noor.id, lessonB, { kind: 'pronunciation' });
    await seedSpeakingTask(ctx, mina.id, seededA.rootActivityId, { shape: 'read_aloud', referenceText: Array.from({ length: 26 }, () => 'alpha').join(' ') });
    await seedSpeakingTask(ctx, noor.id, seededB.rootActivityId, { shape: 'read_aloud', referenceText: Array.from({ length: 26 }, () => 'beta').join(' ') });

    const viewOfB = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${seededB.activityId}`).set('Cookie', mina.cookie);
    expect(viewOfB.status).toBe(404);

    const viewOfA = await request(ctx.app.getHttpServer()).get(`/speaking/activities/${seededA.activityId}`).set('Cookie', noor.cookie);
    expect(viewOfA.status).toBe(404);
  });
});
