import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { gemini } from './helpers/fake-gemini';
import {
  createPipelineTestContext,
  makeAnalysisReadyLesson,
  resetPipelineTables,
  seedSpeaker,
  startAnalysis,
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
  gemini.reset();
  await resetPipelineTables(pipeline.ctx);
});

function http() {
  return request(pipeline.ctx.app.getHttpServer());
}

function readAnalysis(lessonId: string, speaker: Speaker) {
  return http().get(`/lessons/${lessonId}/analysis`).set('Cookie', speaker.cookie);
}

function said(text: string, startMs = 0, endMs = 4_000): SeedUtterance {
  return { startMs, endMs, text, confidence: 0.9 };
}

function fullResponse(overrides: { grammarScore: number; errorSeverity: 'minor' | 'moderate' | 'major'; quote: string }) {
  return {
    competencies: {
      grammar: { score: overrides.grammarScore, justification: 'x' },
      vocabulary: { score: 70, justification: 'x' },
      fluency: { score: 72, justification: 'x' },
      interaction: { score: 68, justification: 'x' },
      comprehension: { score: 75, justification: 'x' },
    },
    strengths: ['a', 'b', 'c'],
    errors: [
      {
        quote: overrides.quote,
        tag: 'grammar:conditional-3',
        correction: 'fixed',
        explanation: 'explained',
        severity: overrides.errorSeverity,
      },
      {
        quote: overrides.quote,
        tag: 'vocab:register',
        correction: 'fixed2',
        explanation: 'explained2',
        severity: 'minor' as const,
      },
    ],
    recurring_tags: [],
    scenario_fit: null,
    topics_to_practice: ['t1', 't2', 't3'],
  };
}

describe('GET /lessons/:lessonId/analysis', () => {
  it('returns_the_callers_analysis_with_labels_and_ordering', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('If I would have known I would have left.')] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: {
        ...fullResponse({ grammarScore: 60, errorSeverity: 'minor', quote: 'If I would have known I would have left.' }),
        errors: [
          { quote: 'If I would have known I would have left.', tag: 'grammar:conditional-3', correction: 'fixed', explanation: 'x', severity: 'minor' },
          { quote: 'If I would have known I would have left.', tag: 'vocab:register', correction: 'fixed2', explanation: 'x', severity: 'major' },
        ],
      },
    });
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    const response = await readAnalysis(lesson.lessonId, ana);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.status).toBe('ready');
    expect(data.analysis.competencies.map((c: { competency: string }) => c.competency)).toEqual([
      'grammar',
      'vocabulary',
      'fluency',
      'interaction',
      'comprehension',
    ]);
    expect(data.analysis.competencies[0]).toMatchObject({ score: 60, delta: null });
    // Major-severity error sorts first even though it was returned second.
    expect(data.analysis.errors[0]).toMatchObject({ tag: 'vocab:register', severity: 'major', tagLabel: 'Register' });
    expect(data.analysis.errors[1]).toMatchObject({ tag: 'grammar:conditional-3', severity: 'minor', tagLabel: 'Third conditional' });
    expect(data.analysis.errors[0].utteranceId).not.toBeNull();
    expect(data.analysis.strengths.length).toBeGreaterThanOrEqual(3);
    expect(data.analysis.topicsToPractice).toEqual(['t1', 't2', 't3']);
    expect(data.analysis.scenarioContext).toBe('none');
    expect(data.analysis.scenarioFit).toBeNull();
    expect(data.analysis.notes).toEqual([]);
    expect(Date.parse(data.analysis.analyzedAt)).not.toBeNaN();
  }, 60_000);

  it('deltas_compare_with_the_callers_previous_lesson', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });

    const lesson1 = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('First lesson line here.')] }]);
    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: fullResponse({ grammarScore: 60, errorSeverity: 'minor', quote: 'First lesson line here.' }),
    });
    await startAnalysis(pipeline, lesson1.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson1.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const lesson2 = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('Second lesson line here.')] }]);
    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: fullResponse({ grammarScore: 74, errorSeverity: 'minor', quote: 'Second lesson line here.' }),
    });
    await startAnalysis(pipeline, lesson2.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson2.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const first = await readAnalysis(lesson1.lessonId, ana);
    expect(first.body.data.analysis.competencies[0]).toMatchObject({ score: 60, delta: null });

    const second = await readAnalysis(lesson2.lessonId, ana);
    expect(second.body.data.analysis.competencies[0]).toMatchObject({ score: 74, delta: 14 });
  }, 60_000);

  it('reports_each_status_truthfully', async () => {
    // pending: branch queued, never reached lesson_analysis.
    const pendingAna = await seedSpeaker(pipeline.ctx, 'PendingAna', { withGeminiKey: true });
    const pendingLesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: pendingAna, utterances: [said('x')] }]);

    // blocked (reads pending): no Gemini key.
    const blockedBruno = await seedSpeaker(pipeline.ctx, 'BlockedBruno', { withGeminiKey: false });
    const blockedLesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: blockedBruno, utterances: [said('x')] }]);
    await startAnalysis(pipeline, blockedLesson.branches.get(blockedBruno.id)!);
    await waitForStage(pipeline.ctx, blockedLesson.branches.get(blockedBruno.id)!, 'lesson_analysis', ['blocked_missing_key']);

    // failed: two schema-invalid responses.
    const failedCarla = await seedSpeaker(pipeline.ctx, 'FailedCarla', { withGeminiKey: true });
    const failedLesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: failedCarla, utterances: [said('x')] }]);
    gemini.scriptAnalysis(failedCarla.geminiKey!, { kind: 'invalid' }, { kind: 'invalid' });
    await startAnalysis(pipeline, failedLesson.branches.get(failedCarla.id)!);
    await waitForStage(pipeline.ctx, failedLesson.branches.get(failedCarla.id)!, 'lesson_analysis', ['failed']);

    // ready.
    const readyDaniel = await seedSpeaker(pipeline.ctx, 'ReadyDaniel', { withGeminiKey: true });
    const readyLesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: readyDaniel, utterances: [said('Ready line here.')] }]);
    await startAnalysis(pipeline, readyLesson.branches.get(readyDaniel.id)!);
    await waitForStage(pipeline.ctx, readyLesson.branches.get(readyDaniel.id)!, 'lesson_analysis', ['completed']);

    // unavailable: a participant with no pipeline branch at all.
    const unavailableEve = await seedSpeaker(pipeline.ctx, 'UnavailableEve', { withGeminiKey: true });
    await pipeline.ctx.prisma.lessonParticipant.create({
      data: {
        lessonId: readyLesson.lessonId,
        userId: unavailableEve.id,
        identity: unavailableEve.id,
        joinedAt: new Date(),
        connected: false,
      },
    });

    expect((await readAnalysis(pendingLesson.lessonId, pendingAna)).body.data).toMatchObject({
      status: 'pending',
      analysis: null,
    });
    expect((await readAnalysis(blockedLesson.lessonId, blockedBruno)).body.data).toMatchObject({
      status: 'pending',
      analysis: null,
    });
    expect((await readAnalysis(failedLesson.lessonId, failedCarla)).body.data).toMatchObject({
      status: 'failed',
      analysis: null,
    });
    expect((await readAnalysis(readyLesson.lessonId, readyDaniel)).body.data.status).toBe('ready');
    expect((await readAnalysis(readyLesson.lessonId, unavailableEve)).body.data).toMatchObject({
      status: 'unavailable',
      analysis: null,
    });
  }, 90_000);

  it('never_returns_another_participants_analysis', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('Ana secret sentence here today.')] },
      { speaker: bruno, utterances: [said('Bruno secret sentence here today.')] },
    ]);
    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: fullResponse({ grammarScore: 61, errorSeverity: 'minor', quote: 'Ana secret sentence here today.' }),
    });
    gemini.scriptAnalysis(bruno.geminiKey!, {
      kind: 'ok',
      response: fullResponse({ grammarScore: 62, errorSeverity: 'minor', quote: 'Bruno secret sentence here today.' }),
    });
    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await startAnalysis(pipeline, lesson.branches.get(bruno.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'lesson_analysis', ['completed']);

    const asAna = JSON.stringify((await readAnalysis(lesson.lessonId, ana)).body);
    expect(asAna).not.toContain('Bruno secret sentence');
    expect(asAna).not.toContain(bruno.id);
  }, 60_000);

  it('the_pipeline_view_shows_the_blocked_gemini_state', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: false });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('x')] }]);
    const branchId = lesson.branches.get(ana.id)!;
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['blocked_missing_key']);

    const view = await http().get(`/lessons/${lesson.lessonId}/pipeline`).set('Cookie', ana.cookie);
    const stage = (view.body.data.branch.stages as Array<{ stage: string; blockedProvider: string | null; reason: string | null; progress: unknown }>).find(
      (s) => s.stage === 'lesson_analysis',
    )!;
    expect(stage.blockedProvider).toBe('gemini');
    expect(stage.reason).toBe('Blocked — add your Gemini key to analyze this lesson.');
    expect(stage.progress).toBeNull();
  }, 60_000);

  it('retry_of_a_failed_analysis_requeues_it', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('Retry me please today.')] }]);
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(ana.geminiKey!, { kind: 'invalid' }, { kind: 'invalid' });
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['failed']);

    gemini.analysisScripts.delete(ana.geminiKey!);
    const retried = await http().post(`/lessons/${lesson.lessonId}/pipeline/retry`).set('Cookie', ana.cookie);
    expect(retried.status).toBe(202);

    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);
    const view = await readAnalysis(lesson.lessonId, ana);
    expect(view.body.data.status).toBe('ready');
  }, 60_000);

  it('rejects_a_non_participant', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('x')] }]);
    const outsider = await seedSpeaker(pipeline.ctx, 'Outsider', { withGeminiKey: true });

    const response = await readAnalysis(lesson.lessonId, outsider);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CLASS004');
  }, 60_000);

  it('rejects_a_malformed_lesson_id', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const response = await http().get('/lessons/not-a-uuid/analysis').set('Cookie', ana.cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VAL001');
  }, 60_000);

  it('requires_authentication', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('x')] }]);
    const response = await http().get(`/lessons/${lesson.lessonId}/analysis`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH003');
  }, 60_000);
});
