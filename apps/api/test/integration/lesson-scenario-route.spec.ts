import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CLASSROOM_ROOM_NAME } from '../../src/classroom/classroom.constants';
import { defaultSituation, makeHistoryLesson, markedCard } from './helpers/history-fixtures';
import {
  createPipelineTestContext,
  resetPipelineTables,
  seedSpeaker,
  type PipelineTestContext,
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
  await resetPipelineTables(pipeline.ctx);
});

function readScenario(lessonId: string, speaker?: Speaker) {
  const call = request(pipeline.ctx.app.getHttpServer()).get(`/lessons/${lessonId}/scenario`);
  return speaker ? call.set('Cookie', speaker.cookie) : call;
}

describe('GET /lessons/:lessonId/scenario', () => {
  it('returns_the_full_situation_and_only_the_callers_card', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const situation = defaultSituation('past');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        { speaker: ana, branch: 'ready' },
        { speaker: bruno, branch: 'ready' },
      ],
      scenario: situation,
      cards: [markedCard(ana.id, 'ANA-SECRET', 'The Traveler'), markedCard(bruno.id, 'BRUNO-SECRET', 'Airline agent')],
    });

    const cases: Array<[Speaker, string, string, string]> = [
      [ana, 'ANA-SECRET', 'BRUNO-SECRET', 'The Traveler'],
      [bruno, 'BRUNO-SECRET', 'ANA-SECRET', 'Airline agent'],
    ];
    for (const [reader, mine, theirs, roleLabel] of cases) {
      const response = await readScenario(lesson.lessonId, reader);
      expect(response.status).toBe(200);
      const data = response.body.data;
      expect(data).toEqual({
        lessonId: lesson.lessonId,
        status: 'ready',
        situation: {
          title: situation.title,
          setting: situation.setting,
          premise: situation.premise,
          roles: situation.roles,
          vocabularyDomain: 'travel',
          discussionHooks: situation.discussionHooks,
        },
        myRoleLabel: roleLabel,
        myCard: {
          status: 'ready',
          background: `Background ${mine}`,
          objective: `Objective ${mine}`,
          constraint: `Constraint ${mine}`,
          register: 'neutral',
          targetExpressions: [`to be on the safe side ${mine}`, `with all due respect ${mine}`, `the bottom line ${mine}`],
        },
      });
      // Every role label and relationship is shared; no other card's content is.
      expect(data.situation.roles).toHaveLength(3);
      expect(JSON.stringify(response.body)).not.toContain(theirs);
      expect(Object.keys(data).sort()).toEqual(['lessonId', 'myCard', 'myRoleLabel', 'situation', 'status']);
    }
  }, 60_000);

  it('a_failed_card_keeps_the_situation_and_role_label', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: 'ready' }],
      scenario: defaultSituation(),
      cards: [{ userId: ana.id, status: 'failed', roleLabel: 'The Traveler' }],
    });

    const data = (await readScenario(lesson.lessonId, ana)).body.data;
    expect(data.situation).not.toBeNull();
    expect(data.myRoleLabel).toBe('The Traveler');
    expect(data.myCard).toEqual({
      status: 'failed',
      background: null,
      objective: null,
      constraint: null,
      register: null,
      targetExpressions: null,
    });
  }, 60_000);

  it('no_scenario_returns_no_situation', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const cases = [
      { scenario: { status: 'no_scenario' as const }, status: 'no_scenario' },
      { scenario: { status: 'failed' as const, vocabularyDomain: 'travel' }, status: 'failed' },
      { scenario: { status: 'pending' as const }, status: 'pending' },
      { scenario: null, status: 'none' },
    ];
    for (const { scenario, status } of cases) {
      const lesson = await makeHistoryLesson(pipeline.ctx, { participants: [{ speaker: ana, branch: 'ready' }], scenario });
      expect((await readScenario(lesson.lessonId, ana)).body.data).toEqual({
        lessonId: lesson.lessonId,
        status,
        situation: null,
        myRoleLabel: null,
        myCard: null,
      });
    }
  }, 60_000);

  it('the_open_lesson_view_is_unchanged', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [
        { speaker: ana, branch: null },
        { speaker: bruno, branch: null },
      ],
      lessonStatus: 'live',
      room: CLASSROOM_ROOM_NAME,
      scenario: defaultSituation('open'),
      cards: [markedCard(ana.id, 'ANA-OPEN'), markedCard(bruno.id, 'BRUNO-OPEN', 'Airline agent')],
    });

    const open = await request(pipeline.ctx.app.getHttpServer()).get('/classroom/scenario').set('Cookie', ana.cookie);
    expect(open.status).toBe(200);
    const past = (await readScenario(lesson.lessonId, ana)).body.data;

    // F06's view, now built through the extracted builder, still carries its reroll fields and exactly the same content.
    expect(open.body.data).toMatchObject({ lessonId: lesson.lessonId, status: 'ready', canReroll: false, rerollsRemaining: 3 });
    expect(open.body.data.situation).toEqual(past.situation);
    expect(open.body.data.myRoleLabel).toBe(past.myRoleLabel);
    expect(open.body.data.myCard).toEqual(past.myCard);
    expect(JSON.stringify(open.body)).not.toContain('BRUNO-OPEN');
  }, 60_000);

  it('rejects_a_non_participant', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider');
    const lesson = await makeHistoryLesson(pipeline.ctx, {
      participants: [{ speaker: ana, branch: 'ready' }],
      scenario: defaultSituation(),
      cards: [markedCard(ana.id, 'ANA')],
    });

    const forbidden = await readScenario(lesson.lessonId, outsider);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('CLASS004');
    expect(JSON.stringify(forbidden.body)).not.toContain('ANA');

    const malformed = await request(pipeline.ctx.app.getHttpServer()).get('/lessons/nope/scenario').set('Cookie', ana.cookie);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VAL001');

    const anonymous = await readScenario(lesson.lessonId);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH003');
  }, 60_000);
});
