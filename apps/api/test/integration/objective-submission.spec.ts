import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PlanHistoryReader } from '../../src/plans/plan-history.reader';
import { PlanRepository } from '../../src/plans/plan.repository';
import {
  ALL_CORRECT_ANSWERS,
  api,
  coreQuestions,
  createActivityTestContext,
  GRAMMAR_TAG,
  mcq,
  ONE_FILL_WRONG_ANSWERS,
  orderingQuestion,
  resetActivityTables,
  SECOND_GRAMMAR_TAG,
  seedItem,
  seedPlan,
  type ActivityTestContext,
  type SeedItemOptions,
} from './helpers/activity-fixtures';
import { lessonSourceInput, seedLesson, seedProfileSource, seedSpeaker } from './helpers/pipeline-fixtures';

let env: ActivityTestContext;

beforeAll(async () => {
  env = await createActivityTestContext();
}, 240_000);

afterAll(async () => {
  await env?.close();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetActivityTables(env.ctx);
});

async function setup(name: string, item: SeedItemOptions = {}) {
  const { ctx } = env;
  const speaker = await seedSpeaker(ctx, name, { withKey: false });
  const lessonId = await seedLesson(ctx, [speaker.id], new Date());
  const seeded = await seedItem(ctx, `item-${name.toLowerCase()}`, item);
  const plan = await seedPlan(ctx, speaker.id, lessonId, [
    { kind: (item.type ?? 'reading') as 'reading', contentItemId: seeded.id, targetTags: item.targetTags ?? [GRAMMAR_TAG] },
    { kind: 'writing' },
  ]);
  return { speaker, lessonId, item: seeded, planId: plan.planId, id: plan.activityIds[0]! };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function start(a: Setup) {
  const response = await api(env.ctx).post(`/activities/${a.id}/attempts`, a.speaker).expect(200);
  return {
    attemptId: response.body.data.objective.attempt.id as string,
    fingerprint: response.body.data.objective.item.questionsFingerprint as string,
  };
}

function submit(a: Setup, started: { attemptId: string; fingerprint: string }, answers: unknown[], timeSpentSeconds = 120) {
  return api(env.ctx)
    .put(`/activities/${a.id}/attempts/${started.attemptId}/submission`, a.speaker)
    .send({ questionsFingerprint: started.fingerprint, timeSpentSeconds, answers });
}

describe('objective submission', () => {
  it('completion_records_score_time_answers_and_the_prompt_version', async () => {
    const a = await setup('Ana', { provenance: 'generated' });
    const started = await start(a);
    const response = await submit(a, started, ONE_FILL_WRONG_ANSWERS, 402).expect(200);

    const attempt = await env.ctx.prisma.objectiveAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
    expect(attempt).toMatchObject({
      status: 'submitted',
      scoreCorrect: 4,
      scoreTotal: 5,
      unscoredCount: 0,
      timeSpentSeconds: 402,
      promptId: 'reading-generate',
      promptVersion: '3',
    });
    expect(attempt.answers).toHaveLength(5);
    expect(attempt.results).toHaveLength(5);
    const activity = await env.ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(activity).toMatchObject({ state: 'completed', completionKey: started.attemptId, scoreCorrect: 4, scoreTotal: 5, timeSpentSeconds: 402 });

    const { result } = response.body.data.objective;
    expect(result).toMatchObject({ scoreCorrect: 4, scoreTotal: 5, timeSpentSeconds: 402 });
    expect(result.questions[1]).toMatchObject({
      outcome: 'incorrect',
      response: 'would have heard',
      correctAnswer: 'had listened to',
      acceptedAnswers: ['had listened to', 'had heard'],
      explanation: expect.stringContaining('third conditional'),
    });
    expect(response.body.data.activity.state).toBe('completed');
  });

  it('incorrect_answers_write_occurrences_under_the_item_tags_within_five_seconds', async () => {
    const a = await setup('Bea', { targetTags: [GRAMMAR_TAG, SECOND_GRAMMAR_TAG] });
    const started = await start(a);
    const answers = ALL_CORRECT_ANSWERS.map((answer) => {
      if (answer.index === 0) return { ...answer, optionIndex: 0 };
      if (answer.index === 1) return { ...answer, text: 'would have heard' };
      return answer;
    });

    const began = Date.now();
    await submit(a, started, answers).expect(200);
    expect(Date.now() - began).toBeLessThan(5_000);

    const rows = await env.ctx.prisma.errorLedgerOccurrence.findMany({ where: { userId: a.speaker.id } });
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.activityId === a.id)).toBe(true);
    expect(rows.map((row) => row.tag).sort()).toEqual([SECOND_GRAMMAR_TAG, SECOND_GRAMMAR_TAG, GRAMMAR_TAG, GRAMMAR_TAG]);
    const fill = rows.filter((row) => row.quote !== null);
    expect(fill).toHaveLength(2);
    expect(fill[0]).toMatchObject({
      quote: 'If the council would have heard the tenants, the scheme would have survived.',
      correction: 'If the council had listened to the tenants, the scheme would have survived.',
    });
  });

  it('an_objective_outcome_updates_scores_and_ledger_within_five_seconds', async () => {
    const a = await setup('Cai', { type: 'grammar' });
    const started = await start(a);
    const began = Date.now();
    await submit(a, started, ONE_FILL_WRONG_ANSWERS).expect(200);
    expect(Date.now() - began).toBeLessThan(5_000);

    const measurement = await env.ctx.prisma.profileMeasurement.findFirstOrThrow({ where: { userId: a.speaker.id, competency: 'grammar' } });
    expect(measurement).toMatchObject({ sourceKind: 'activity', value: 80 });
    expect(measurement.weight).toBeCloseTo(0.15, 5);
    const competency = await env.ctx.prisma.profileCompetency.findFirstOrThrow({ where: { userId: a.speaker.id, competency: 'grammar' } });
    expect(competency.measurementCount).toBe(1);
    const entry = await env.ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: a.speaker.id, tag: GRAMMAR_TAG } });
    expect(entry).toMatchObject({ occurrenceCount: 1, state: 'practicing' });
  });

  it('a_fully_correct_attempt_records_a_correct_encounter_per_target_tag', async () => {
    const a = await setup('Dan', { targetTags: [GRAMMAR_TAG, SECOND_GRAMMAR_TAG] });
    await seedProfileSource(
      env.ctx,
      lessonSourceInput({
        kind: 'lesson_analysis',
        userId: a.speaker.id,
        lessonId: a.lessonId,
        occurredAt: new Date(Date.now() - 86_400_000),
        occurrences: [{ tag: GRAMMAR_TAG, quote: 'If I would have known' }],
      }),
    );
    expect((await env.ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: a.speaker.id, tag: GRAMMAR_TAG } })).state).toBe('new');

    const started = await start(a);
    await submit(a, started, ALL_CORRECT_ANSWERS).expect(200);

    const encounters = await env.ctx.prisma.errorLedgerEncounter.findMany({ where: { userId: a.speaker.id } });
    expect(encounters.map((row) => row.tag).sort()).toEqual([SECOND_GRAMMAR_TAG, GRAMMAR_TAG]);
    expect(encounters.every((row) => row.activityId === a.id)).toBe(true);
    expect((await env.ctx.prisma.errorLedgerEntry.findFirstOrThrow({ where: { userId: a.speaker.id, tag: GRAMMAR_TAG } })).state).toBe('practicing');
  });

  it('a_repeated_submission_returns_the_stored_result_and_writes_nothing_twice', async () => {
    const a = await setup('Eli');
    const started = await start(a);
    const first = await submit(a, started, ONE_FILL_WRONG_ANSWERS, 100).expect(200);
    const sourcesBefore = await env.ctx.prisma.profileSource.count({ where: { userId: a.speaker.id } });
    const occurrencesBefore = await env.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: a.speaker.id } });

    const wrong = ALL_CORRECT_ANSWERS.map((answer) => (answer.format === 'multiple_choice' ? { ...answer, optionIndex: 0 } : { ...answer, text: 'nope' }));
    const second = await submit(a, started, wrong, 9).expect(200);

    expect(second.body.data.objective.result).toEqual(first.body.data.objective.result);
    expect(await env.ctx.prisma.profileSource.count({ where: { userId: a.speaker.id } })).toBe(sourcesBefore);
    expect(await env.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: a.speaker.id } })).toBe(occurrencesBefore);
    expect(await env.ctx.prisma.profileSource.count({ where: { userId: a.speaker.id, kind: 'activity', sourceKey: started.attemptId } })).toBe(1);
  });

  it('concurrent_submissions_of_one_attempt_write_once', async () => {
    const a = await setup('Fay');
    const started = await start(a);
    const [one, two] = await Promise.all([submit(a, started, ONE_FILL_WRONG_ANSWERS), submit(a, started, ONE_FILL_WRONG_ANSWERS)]);
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(two.body.data.objective.result).toEqual(one.body.data.objective.result);
    expect(await env.ctx.prisma.profileSource.count({ where: { userId: a.speaker.id, kind: 'activity' } })).toBe(1);
    expect(await env.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: a.speaker.id } })).toBe(1);
  });

  it('a_submission_for_a_replaced_plan_still_reaches_the_profile', async () => {
    const a = await setup('Gus');
    const started = await start(a);
    await env.ctx.prisma.studyPlan.update({ where: { id: a.planId }, data: { status: 'archived', archivedAt: new Date() } });
    await seedPlan(env.ctx, a.speaker.id, a.lessonId, [{ kind: 'writing' }, { kind: 'writing' }], { origin: 'recording_failed' });

    const response = await submit(a, started, ONE_FILL_WRONG_ANSWERS).expect(200);
    expect(response.body.data.objective.result.scoreCorrect).toBe(4);
    expect(response.body.data.activity).toMatchObject({ state: 'in_progress', readOnly: true });
    expect(await env.ctx.prisma.errorLedgerOccurrence.count({ where: { userId: a.speaker.id } })).toBe(1);
    const old = await env.ctx.prisma.studyPlanActivity.findUniqueOrThrow({ where: { id: a.id } });
    expect(old).toMatchObject({ state: 'in_progress', completionKey: null });
  });

  it('a_submission_after_a_skip_elsewhere_is_rejected', async () => {
    const a = await setup('Hal');
    const started = await start(a);
    await api(env.ctx).post(`/activities/${a.id}/skip`, a.speaker).send({ reason: 'Not relevant to me' }).expect(200);
    const response = await submit(a, started, ONE_FILL_WRONG_ANSWERS).expect(409);
    expect(response.body.error.code).toBe('ACT003');
    expect(await env.ctx.prisma.profileSource.count({ where: { userId: a.speaker.id } })).toBe(0);
  });

  it('a_reimported_item_does_not_change_an_open_attempts_grading', async () => {
    const a = await setup('Ivy');
    const started = await start(a);
    const changed = coreQuestions();
    changed[0] = mcq({ answer: 'Rising interest rates', explanation: 'Changed by a re-import.' });
    await env.ctx.prisma.contentItem.update({ where: { id: a.item.id }, data: { questions: changed as never } });

    const response = await submit(a, started, ALL_CORRECT_ANSWERS).expect(200);
    expect(response.body.data.objective.result.scoreCorrect).toBe(5);
    expect(response.body.data.objective.result.questions[0].explanation).toContain('second paragraph');
    // The live item now has a different fingerprint than the attempt's snapshot.
    const view = await api(env.ctx).get(`/activities/${a.id}`, a.speaker).expect(200);
    expect(view.body.data.objective.item.questionsFingerprint).toBe(started.fingerprint);
  });

  it('a_corrupted_key_is_unscored_and_the_score_uses_the_rest', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const questions = coreQuestions();
    questions[2] = mcq({ answer: 'Not one of the options' });
    const a = await setup('Jon', { questions });
    const started = await start(a);
    const answers = ALL_CORRECT_ANSWERS.filter((answer) => answer.index !== 2);

    const response = await submit(a, started, answers).expect(200);
    expect(response.body.data.objective.result).toMatchObject({ scoreCorrect: 4, scoreTotal: 4, unscoredCount: 1 });
    expect(response.body.data.objective.result.questions[2]).toMatchObject({ outcome: 'unscored', unscoredReason: 'answer_key_invalid', correctAnswer: null });
    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('item-jon') && line.includes('question 3'))).toBe(true);
    expect(lines.join('\n')).not.toContain('Exasperated');
  });

  it('ordering_and_matching_questions_are_unscored_until_the_full_scope', async () => {
    const questions = coreQuestions();
    questions[4] = orderingQuestion();
    const a = await setup('Kim', { questions });
    const started = await start(a);
    const response = await submit(a, started, ALL_CORRECT_ANSWERS.filter((answer) => answer.index !== 4)).expect(200);
    expect(response.body.data.objective.result).toMatchObject({ scoreCorrect: 4, scoreTotal: 4, unscoredCount: 1 });
    expect(response.body.data.objective.result.questions[4]).toMatchObject({ outcome: 'unscored', unscoredReason: 'format_unavailable' });
  });

  it('a_completed_activity_is_reflected_in_plan_completion_and_history', async () => {
    const a = await setup('Lea');
    const started = await start(a);
    await submit(a, started, ALL_CORRECT_ANSWERS).expect(200);
    await api(env.ctx).put(`/activities/${a.id}/rating`, a.speaker).send({ rating: 'just_right', notUseful: false }).expect(200);

    const view = await api(env.ctx).get(`/activities/${a.id}`, a.speaker).expect(200);
    expect(view.body.data.activity.planCompletionPercent).toBe(50);
    const current = await api(env.ctx).get('/plans/current', a.speaker).expect(200);
    expect(current.body.data.plan.progress).toMatchObject({ completed: 1, completionPercent: 50 });
    const history = await env.ctx.app.get(PlanHistoryReader).completedActivities(a.speaker.id, new Date(Date.now() - 86_400_000));
    expect(history).toEqual([expect.objectContaining({ activityId: a.id, kind: 'reading', rating: 'just_right', notUseful: false })]);
  });

  it('no_ai_call_is_made_from_open_to_rating', async () => {
    const a = await setup('Max');
    const started = await start(a);
    await submit(a, started, ONE_FILL_WRONG_ANSWERS).expect(200);
    await api(env.ctx).put(`/activities/${a.id}/rating`, a.speaker).send({ rating: 'too_hard', notUseful: false }).expect(200);
    expect(await env.ctx.prisma.promptExecution.count({ where: { userId: a.speaker.id } })).toBe(0);
    expect(await env.ctx.prisma.credentialUsage.count({ where: { userId: a.speaker.id } })).toBe(0);
  });

  it('submission_serializes_with_plan_activation', async () => {
    const a = await setup('Nia');
    const started = await start(a);
    const repository = env.ctx.app.get(PlanRepository);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Activation holds this same per-user lock for the whole of its transaction.
    const activation = env.ctx.prisma.$transaction(async (tx) => {
      await repository.lock(tx, a.speaker.id);
      locked();
      await held;
    });
    await acquired;

    let finished = false;
    const pending = submit(a, started, ONE_FILL_WRONG_ANSWERS).then((response) => {
      finished = true;
      return response;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(finished).toBe(false);

    release();
    await activation;
    const response = await pending;
    expect(response.status).toBe(200);
    expect(finished).toBe(true);
  });

  it('a_submission_that_does_not_match_the_snapshot_is_rejected', async () => {
    const a = await setup('Oto');
    const started = await start(a);
    const staleFingerprint = await api(env.ctx)
      .put(`/activities/${a.id}/attempts/${started.attemptId}/submission`, a.speaker)
      .send({ questionsFingerprint: 'b'.repeat(64), timeSpentSeconds: 5, answers: ALL_CORRECT_ANSWERS })
      .expect(400);
    expect(staleFingerprint.body.error.code).toBe('VAL001');
    const missing = await submit(a, started, ALL_CORRECT_ANSWERS.slice(0, 4)).expect(400);
    expect(missing.body.error.code).toBe('VAL001');
    expect(JSON.stringify(missing.body)).toContain('answers.4');
    expect((await env.ctx.prisma.objectiveAttempt.findUniqueOrThrow({ where: { id: started.attemptId } })).status).toBe('open');
  });
});
