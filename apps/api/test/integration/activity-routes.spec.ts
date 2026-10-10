import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  ALL_CORRECT_ANSWERS,
  api,
  coreQuestions,
  createActivityTestContext,
  mcq,
  resetActivityTables,
  seedItem,
  seedPlan,
  type ActivityTestContext,
  type SeededItem,
  type SeedItemOptions,
} from './helpers/activity-fixtures';
import { seedLesson, seedSpeaker } from './helpers/pipeline-fixtures';

let env: ActivityTestContext;

beforeAll(async () => {
  env = await createActivityTestContext();
}, 240_000);

afterAll(async () => {
  await env?.close();
});

afterEach(async () => {
  await resetActivityTables(env.ctx);
});

async function setup(name: string, items: Array<SeedItemOptions & { slug: string }>, specs: Array<'item' | 'writing'>) {
  const { ctx } = env;
  const speaker = await seedSpeaker(ctx, name, { withKey: false });
  const lessonId = await seedLesson(ctx, [speaker.id], new Date());
  const seeded: SeededItem[] = [];
  for (const { slug, ...options } of items) {
    seeded.push(await seedItem(ctx, `${slug}-${name.toLowerCase()}`, options));
  }
  let next = 0;
  const plan = await seedPlan(
    ctx,
    speaker.id,
    lessonId,
    specs.map((spec) =>
      spec === 'writing'
        ? { kind: 'writing' as const }
        : { kind: (items[next]?.type ?? 'reading') as 'reading', contentItemId: seeded[next++]?.id },
    ),
  );
  return { speaker, lessonId, items: seeded, ...plan };
}

describe('activity routes', () => {
  it('opening_a_plan_activity_resolves_the_full_item_without_its_keys', async () => {
    const a = await setup('Ana', [{ slug: 'reading-a', type: 'reading' }], ['item', 'writing']);
    const response = await api(env.ctx).get(`/activities/${a.activityIds[0]}`, a.speaker).expect(200);

    const { objective, activity, session } = response.body.data;
    expect(objective.item.questions).toHaveLength(5);
    expect(objective.item.passage).toEqual({ kind: 'text', text: expect.stringContaining('Had the council listened') });
    expect(objective.item.source).toBeNull();
    expect(objective.attempt).toBeNull();
    expect(objective.result).toBeNull();
    expect(activity.state).toBe('pending');
    expect(session).toMatchObject({ day: 1, position: 1, count: 2 });
    const json = JSON.stringify(response.body);
    for (const secret of ['"answer"', '"explanation"', 'had listened to', 'second paragraph', 'bbc.co.uk', 'BBC Radio 4']) {
      expect(json).not.toContain(secret);
    }
    const row = await env.ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.activityIds[0]! } });
    expect(row.state).toBe('pending');
  });

  it('a_listening_view_withholds_the_transcript_until_submission', async () => {
    const a = await setup('Bea', [{ slug: 'listening-b', type: 'listening', body: 'Presenter: tonight we ask a hard question.' }], ['item', 'writing']);
    const id = a.activityIds[0]!;
    const before = await api(env.ctx).get(`/activities/${id}`, a.speaker).expect(200);
    expect(before.body.data.objective.item.passage).toBeNull();
    expect(before.body.data.objective.item.hasAudio).toBe(true);
    expect(JSON.stringify(before.body)).not.toContain('tonight we ask');

    const started = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(200);
    const { id: attemptId, ...rest } = started.body.data.objective.attempt;
    expect(rest.status).toBe('open');
    const fingerprint = started.body.data.objective.item.questionsFingerprint;
    await api(env.ctx)
      .put(`/activities/${id}/attempts/${attemptId}/submission`, a.speaker)
      .send({ questionsFingerprint: fingerprint, timeSpentSeconds: 30, answers: ALL_CORRECT_ANSWERS })
      .expect(200);

    const after = await api(env.ctx).get(`/activities/${id}`, a.speaker).expect(200);
    expect(after.body.data.objective.item.passage).toEqual({ kind: 'transcript', text: 'Presenter: tonight we ask a hard question.' });
    expect(after.body.data.objective.item.source).toEqual({ name: 'BBC Radio 4', url: 'https://www.bbc.co.uk/programmes/example' });
  });

  it('the_first_interaction_starts_one_attempt_and_marks_the_activity_in_progress', async () => {
    const a = await setup('Cai', [{ slug: 'reading-c', type: 'reading' }], ['item', 'writing']);
    const id = a.activityIds[0]!;
    const first = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(200);
    const second = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(200);

    expect(second.body.data.objective.attempt.id).toBe(first.body.data.objective.attempt.id);
    expect(await env.ctx.prisma.objectiveAttempt.count({ where: { userId: a.speaker.id } })).toBe(1);
    const row = await env.ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id } });
    expect(row.state).toBe('in_progress');
    expect(first.body.data.activity.state).toBe('in_progress');
  });

  it('an_attempt_started_before_carry_over_resumes_on_the_carried_copy', async () => {
    const a = await setup('Dan', [{ slug: 'reading-d', type: 'reading' }], ['item', 'writing']);
    const oldId = a.activityIds[0]!;
    const started = await api(env.ctx).post(`/activities/${oldId}/attempts`, a.speaker).expect(200);
    const attemptId = started.body.data.objective.attempt.id;

    await env.ctx.prisma.studyPlan.update({ where: { id: a.planId }, data: { status: 'archived', archivedAt: new Date() } });
    const next = await seedPlan(env.ctx, a.speaker.id, a.lessonId, [
      { kind: 'reading', contentItemId: a.items[0]!.id, state: 'in_progress', carriedFromActivityId: oldId },
      { kind: 'writing' },
    ], { origin: 'recording_failed' });

    const resumed = await api(env.ctx).post(`/activities/${next.activityIds[0]}/attempts`, a.speaker).expect(200);
    expect(resumed.body.data.objective.attempt.id).toBe(attemptId);
    expect(resumed.body.data.activity.id).toBe(next.activityIds[0]);
    const viaOld = await api(env.ctx).get(`/activities/${oldId}`, a.speaker).expect(200);
    expect(viaOld.body.data.activity.id).toBe(next.activityIds[0]);
    expect(viaOld.body.data.activity.lineage).toEqual([oldId, next.activityIds[0]]);
  });

  it('starting_on_a_replaced_plan_is_rejected', async () => {
    const a = await setup('Eli', [{ slug: 'reading-e', type: 'reading' }], ['item', 'writing']);
    await env.ctx.prisma.studyPlan.update({ where: { id: a.planId }, data: { status: 'archived', archivedAt: new Date() } });
    const response = await api(env.ctx).post(`/activities/${a.activityIds[0]}/attempts`, a.speaker).expect(409);
    expect(response.body.error.code).toBe('PLAN004');
    const view = await api(env.ctx).get(`/activities/${a.activityIds[0]}`, a.speaker).expect(200);
    expect(view.body.data.activity.readOnly).toBe(true);
  });

  it('starting_a_writing_task_is_rejected', async () => {
    const a = await setup('Fay', [{ slug: 'reading-f', type: 'reading' }], ['item', 'writing']);
    const response = await api(env.ctx).post(`/activities/${a.activityIds[1]}/attempts`, a.speaker).expect(409);
    expect(response.body.error.code).toBe('ACT001');
    const view = await api(env.ctx).get(`/activities/${a.activityIds[1]}`, a.speaker).expect(200);
    expect(view.body.data.objective).toBeNull();
  });

  it('an_item_with_no_scorable_question_cannot_start', async () => {
    const broken = Array.from({ length: 5 }, () => mcq({ answer: 'Not one of the options' }));
    const a = await setup('Gus', [{ slug: 'reading-g', type: 'reading', questions: broken }], ['item', 'writing']);
    const id = a.activityIds[0]!;
    const view = await api(env.ctx).get(`/activities/${id}`, a.speaker).expect(200);
    expect(view.body.data.objective.runnable).toBe(false);
    expect(view.body.data.objective.item.questions.every((q: { format: string }) => q.format === 'unscored')).toBe(true);
    const response = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(409);
    expect(response.body.error.code).toBe('ACT006');
  });

  it('skip_marks_skipped_abandons_the_attempt_and_writes_nothing_to_the_ledger', async () => {
    const a = await setup('Hal', [{ slug: 'reading-h', type: 'reading' }], ['item', 'writing']);
    const id = a.activityIds[0]!;
    const started = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(200);
    const skipped = await api(env.ctx).post(`/activities/${id}/skip`, a.speaker).send({ reason: '  Too difficult right now ' }).expect(200);

    expect(skipped.body.data.activity).toMatchObject({ state: 'skipped', skipReason: 'Too difficult right now' });
    expect(skipped.body.data.objective.attempt).toBeNull();
    const attempt = await env.ctx.prisma.objectiveAttempt.findUniqueOrThrow({ where: { id: started.body.data.objective.attempt.id } });
    expect(attempt.status).toBe('abandoned');
    expect(attempt.abandonedAt).not.toBeNull();
    expect(await env.ctx.prisma.profileSource.count({ where: { userId: a.speaker.id } })).toBe(0);
    expect(await env.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: a.speaker.id } })).toBe(0);

    const again = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(409);
    expect(again.body.error.code).toBe('ACT003');
    await api(env.ctx).post(`/activities/${id}/skip`, a.speaker).send({ reason: '' }).expect(400);
  });

  it('skip_and_rating_work_for_a_task_activity', async () => {
    const a = await setup('Ivy', [{ slug: 'reading-i', type: 'reading' }], ['item', 'writing']);
    const writingId = a.activityIds[1]!;
    const skipped = await api(env.ctx).post(`/activities/${writingId}/skip`, a.speaker).send({ reason: 'Other: no time' }).expect(200);
    expect(skipped.body.data.activity.state).toBe('skipped');

    const done = await seedPlan(env.ctx, a.speaker.id, a.lessonId, [{ kind: 'writing', state: 'completed' }, { kind: 'writing' }], { status: 'archived', origin: 'recording_failed' });
    const rated = await api(env.ctx).put(`/activities/${done.activityIds[0]}/rating`, a.speaker).send({ rating: 'too_hard', notUseful: true }).expect(200);
    expect(rated.body.data).toMatchObject({ rating: 'too_hard', notUseful: true });
    const row = await env.ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: done.activityIds[0]! } });
    expect(row.difficultyRating).toBe('too_hard');
  });

  it('rating_requires_a_completed_activity', async () => {
    const a = await setup('Jon', [{ slug: 'reading-j', type: 'reading' }], ['item', 'writing']);
    const response = await api(env.ctx).put(`/activities/${a.activityIds[0]}/rating`, a.speaker).send({ rating: 'just_right', notUseful: false }).expect(400);
    expect(response.body.error.code).toBe('VAL001');
  });

  it('a_rating_is_stored_on_the_plan_activity_and_against_the_prompt_version', async () => {
    const a = await setup('Kim', [{ slug: 'reading-k', type: 'reading', provenance: 'generated' }], ['item', 'writing']);
    const id = a.activityIds[0]!;
    const started = await api(env.ctx).post(`/activities/${id}/attempts`, a.speaker).expect(200);
    await api(env.ctx)
      .put(`/activities/${id}/attempts/${started.body.data.objective.attempt.id}/submission`, a.speaker)
      .send({ questionsFingerprint: started.body.data.objective.item.questionsFingerprint, timeSpentSeconds: 10, answers: ALL_CORRECT_ANSWERS })
      .expect(200);

    await api(env.ctx).put(`/activities/${id}/rating`, a.speaker).send({ rating: 'too_easy', notUseful: false }).expect(200);
    const again = await api(env.ctx).put(`/activities/${id}/rating`, a.speaker).send({ rating: 'just_right', notUseful: true }).expect(200);
    expect(again.body.data).toMatchObject({ rating: 'just_right', notUseful: true });

    const activity = await env.ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id } });
    expect(activity).toMatchObject({ difficultyRating: 'just_right', notUseful: true });
    const attempt = await env.ctx.prisma.objectiveAttempt.findFirstOrThrow({ where: { planActivityId: id } });
    expect(attempt).toMatchObject({ difficultyRating: 'just_right', notUseful: true, promptId: 'reading-generate', promptVersion: '3' });
    expect(attempt.ratedAt).not.toBeNull();
  });

  it('another_users_activity_attempt_and_media_are_not_found', async () => {
    const ana = await setup('Lea', [{ slug: 'listening-l', type: 'listening' }], ['item', 'writing']);
    const ben = await setup('Max', [{ slug: 'reading-m', type: 'reading' }], ['item', 'writing']);
    const id = ana.activityIds[0]!;
    const started = await api(env.ctx).post(`/activities/${id}/attempts`, ana.speaker).expect(200);
    const attemptId = started.body.data.objective.attempt.id;

    const checks = [
      () => api(env.ctx).get(`/activities/${id}`, ben.speaker),
      () => api(env.ctx).post(`/activities/${id}/attempts`, ben.speaker),
      () => api(env.ctx).put(`/activities/${id}/attempts/${attemptId}/submission`, ben.speaker).send({ questionsFingerprint: 'a'.repeat(64), timeSpentSeconds: 1, answers: [] }),
      () => api(env.ctx).post(`/activities/${id}/skip`, ben.speaker).send({ reason: 'x' }),
      () => api(env.ctx).put(`/activities/${id}/rating`, ben.speaker).send({ rating: null, notUseful: true }),
      () => api(env.ctx).get(`/activities/${id}/media`, ben.speaker),
    ];
    for (const call of checks) {
      const response = await call().expect(404);
      expect(response.body.error.code).toBe('PLAN003');
    }

    const foreign = await api(env.ctx)
      .put(`/activities/${ben.activityIds[0]}/attempts/${attemptId}/submission`, ben.speaker)
      .send({ questionsFingerprint: 'a'.repeat(64), timeSpentSeconds: 1, answers: [] })
      .expect(404);
    expect(foreign.body.error.code).toBe('ACT002');
  });

  it('no_activity_response_carries_another_participants_data', async () => {
    const ana = await setup('Nia', [{ slug: 'reading-n', type: 'reading' }], ['item', 'writing']);
    const ben = await setup('Oto', [{ slug: 'reading-o', type: 'reading', body: 'A completely different passage about tides.' }], ['item', 'writing']);
    await env.ctx.prisma.studyPlanActivity.update({ where: { id: ana.activityIds[0]! }, data: { title: 'Ana only title', targetTags: ['vocab:collocation'] } });
    const anaStart = await api(env.ctx).post(`/activities/${ana.activityIds[0]}/attempts`, ana.speaker).expect(200);

    const bodies: string[] = [];
    const id = ben.activityIds[0]!;
    bodies.push(JSON.stringify((await api(env.ctx).get(`/activities/${id}`, ben.speaker).expect(200)).body));
    const started = await api(env.ctx).post(`/activities/${id}/attempts`, ben.speaker).expect(200);
    bodies.push(JSON.stringify(started.body));
    const submitted = await api(env.ctx)
      .put(`/activities/${id}/attempts/${started.body.data.objective.attempt.id}/submission`, ben.speaker)
      .send({ questionsFingerprint: started.body.data.objective.item.questionsFingerprint, timeSpentSeconds: 5, answers: ALL_CORRECT_ANSWERS })
      .expect(200);
    bodies.push(JSON.stringify(submitted.body));
    bodies.push(JSON.stringify((await api(env.ctx).put(`/activities/${id}/rating`, ben.speaker).send({ rating: 'too_easy', notUseful: false }).expect(200)).body));

    for (const body of bodies) {
      for (const foreign of [ana.activityIds[0]!, ana.activityIds[1]!, ana.planId, anaStart.body.data.objective.attempt.id, 'Ana only title', 'vocab:collocation', ana.speaker.id]) {
        expect(body).not.toContain(foreign);
      }
    }
  });

  it('every_route_requires_a_session', async () => {
    const a = await setup('Pia', [{ slug: 'listening-p', type: 'listening' }], ['item', 'writing']);
    const id = a.activityIds[0]!;
    const unauthenticated = [
      () => api(env.ctx).get(`/activities/${id}`),
      () => api(env.ctx).post(`/activities/${id}/attempts`),
      () => api(env.ctx).put(`/activities/${id}/attempts/${id}/submission`).send({}),
      () => api(env.ctx).post(`/activities/${id}/skip`).send({ reason: 'x' }),
      () => api(env.ctx).put(`/activities/${id}/rating`).send({ rating: null, notUseful: true }),
      () => api(env.ctx).get(`/activities/${id}/media`),
    ];
    for (const call of unauthenticated) {
      const response = await call().expect(401);
      expect(response.body.error.code).toBe('AUTH003');
    }
    expect(coreQuestions()).toHaveLength(5);
  });
});
