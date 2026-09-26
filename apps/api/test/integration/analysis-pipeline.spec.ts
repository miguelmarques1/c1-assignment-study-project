import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { LessonAnalysisReader } from '../../src/analysis/analysis-result.reader';
import { PipelineQueueService } from '../../src/pipeline/pipeline-queue.service';
import { PipelineStateService } from '../../src/pipeline/pipeline-state.service';
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
} from './helpers/pipeline-fixtures';

let pipeline: PipelineTestContext;

function said(text: string, startMs = 0, endMs = 4_000): SeedUtterance {
  return { startMs, endMs, text, confidence: 0.9 };
}

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

function reader() {
  return pipeline.ctx.app.get(LessonAnalysisReader);
}

describe('lesson analysis pipeline', () => {
  it('one_analysis_per_participant_with_their_own_key', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('Ana said this line about the weather.')] },
      { speaker: bruno, utterances: [said('Bruno said this other line about the news.')] },
    ]);

    const anaBranch = lesson.branches.get(ana.id)!;
    const brunoBranch = lesson.branches.get(bruno.id)!;
    await startAnalysis(pipeline, anaBranch);
    await startAnalysis(pipeline, brunoBranch);

    await waitForStage(pipeline.ctx, anaBranch, 'lesson_analysis', ['completed']);
    await waitForStage(pipeline.ctx, brunoBranch, 'lesson_analysis', ['completed']);

    const anaCalls = gemini.callsOf('analysis').filter((call) => call.apiKey === ana.geminiKey);
    const brunoCalls = gemini.callsOf('analysis').filter((call) => call.apiKey === bruno.geminiKey);
    expect(anaCalls).toHaveLength(1);
    expect(brunoCalls).toHaveLength(1);

    const anaAnalysis = await reader().forParticipant(lesson.lessonId, ana.id);
    const brunoAnalysis = await reader().forParticipant(lesson.lessonId, bruno.id);
    expect(anaAnalysis).not.toBeNull();
    expect(brunoAnalysis).not.toBeNull();

    const usage = await pipeline.ctx.prisma.credentialUsage.findMany({ where: { feature: 'F04_lesson-analysis' } });
    expect(usage.some((row) => row.userId === ana.id)).toBe(true);
    expect(usage.some((row) => row.userId === bruno.id)).toBe(true);
  }, 60_000);

  it('output_is_stored_with_every_block', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('If I would have known about the storm I would have left earlier.')] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;
    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis).not.toBeNull();
    expect(Object.keys(analysis!.competencies).sort()).toEqual(
      ['comprehension', 'fluency', 'grammar', 'interaction', 'vocabulary'].sort(),
    );
    for (const competency of Object.values(analysis!.competencies)) {
      expect(competency.score).toBeGreaterThanOrEqual(0);
      expect(competency.score).toBeLessThanOrEqual(100);
      expect(competency.justification.length).toBeGreaterThan(0);
    }
    expect(analysis!.strengths.length).toBeGreaterThanOrEqual(3);
    expect(analysis!.strengths.length).toBeLessThanOrEqual(5);
    expect(analysis!.topics.length).toBeGreaterThanOrEqual(3);
    expect(analysis!.topics.length).toBeLessThanOrEqual(6);
    expect(analysis!.errors.length).toBeGreaterThan(0);
    const error = analysis!.errors[0]!;
    expect(error.quote.length).toBeGreaterThan(0);
    expect(error.tag).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    expect(error.correction.length).toBeGreaterThan(0);
    expect(error.explanation.length).toBeGreaterThan(0);
    expect(['minor', 'moderate', 'major']).toContain(error.severity);
  }, 60_000);

  it('an_unknown_tag_triggers_the_library_retry', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('This is the exact line to quote back verbatim.')] },
    ]);
    const branchId = lesson.branches.get(ana.id)!;

    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: {
        competencies: {
          grammar: { score: 60, justification: 'x' },
          vocabulary: { score: 60, justification: 'x' },
          fluency: { score: 60, justification: 'x' },
          interaction: { score: 60, justification: 'x' },
          comprehension: { score: 60, justification: 'x' },
        },
        strengths: ['a', 'b', 'c'],
        errors: [
          {
            quote: 'This is the exact line to quote back verbatim.',
            tag: 'grammar:made-up-tag',
            correction: 'x',
            explanation: 'x',
            severity: 'minor',
          },
        ],
        recurring_tags: [],
        scenario_fit: null,
        topics_to_practice: ['a', 'b', 'c'],
      },
    });

    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    const calls = gemini.callsOf('analysis').filter((call) => call.apiKey === ana.geminiKey);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.message).toContain('Correction needed');

    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis).not.toBeNull();
  }, 60_000);

  it('the_input_carries_the_situation_and_only_the_owners_card', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(
      pipeline,
      [
        { speaker: ana, utterances: [said('Ana talks about the shared situation here.')] },
        { speaker: bruno, utterances: [said('Bruno talks about the shared situation too.')] },
      ],
      {
        scenario: {
          status: 'ready',
          setting: 'UNIQUE_SETTING_MARKER',
          premise: 'UNIQUE_PREMISE_MARKER',
          vocabularyDomain: 'travel',
          roles: [
            { label: 'The Traveler', relationship: 'x' },
            { label: 'The Agent', relationship: 'y' },
          ],
        },
        cards: [
          {
            userId: ana.id,
            status: 'ready',
            roleLabel: 'The Traveler',
            background: 'ANA_ONLY_BACKGROUND',
            objective: 'ANA_ONLY_OBJECTIVE',
            constraintText: 'ANA_ONLY_CONSTRAINT',
            register: 'neutral',
            targetExpressions: ['ana expression one', 'ana expression two', 'ana expression three', 'ana expression four', 'ana expression five', 'ana expression six'],
          },
          {
            userId: bruno.id,
            status: 'ready',
            roleLabel: 'The Agent',
            background: 'BRUNO_ONLY_BACKGROUND',
            objective: 'BRUNO_ONLY_OBJECTIVE',
            constraintText: 'BRUNO_ONLY_CONSTRAINT',
            register: 'formal',
            targetExpressions: ['bruno expression one', 'bruno expression two', 'bruno expression three', 'bruno expression four', 'bruno expression five', 'bruno expression six'],
          },
        ],
      },
    );

    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await startAnalysis(pipeline, lesson.branches.get(bruno.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'lesson_analysis', ['completed']);

    const anaMessage = gemini.callsOf('analysis').find((call) => call.apiKey === ana.geminiKey)!.message;
    const brunoMessage = gemini.callsOf('analysis').find((call) => call.apiKey === bruno.geminiKey)!.message;

    expect(anaMessage).toContain('UNIQUE_SETTING_MARKER');
    expect(anaMessage).toContain('ANA_ONLY_BACKGROUND');
    expect(anaMessage).not.toContain('BRUNO_ONLY_BACKGROUND');
    expect(anaMessage).not.toContain('BRUNO_ONLY_OBJECTIVE');
    expect(anaMessage).not.toContain('BRUNO_ONLY_CONSTRAINT');

    expect(brunoMessage).toContain('UNIQUE_SETTING_MARKER');
    expect(brunoMessage).toContain('BRUNO_ONLY_BACKGROUND');
    expect(brunoMessage).not.toContain('ANA_ONLY_BACKGROUND');
    expect(brunoMessage).not.toContain('ANA_ONLY_OBJECTIVE');
    expect(brunoMessage).not.toContain('ANA_ONLY_CONSTRAINT');
  }, 60_000);

  it('scenario_fit_lists_used_and_not_used_from_the_owners_card', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const cardExpressions = ['to be on the safe side', 'I would feel more comfortable if', 'with all due respect', 'let us be realistic', 'the bottom line is', 'no offense, but'];
    const lesson = await makeAnalysisReadyLesson(
      pipeline,
      [{ speaker: ana, utterances: [said('With all due respect, I would feel more comfortable if we waited.')] }],
      {
        scenario: {
          status: 'ready',
          setting: 'A negotiation.',
          premise: 'A tense negotiation.',
          vocabularyDomain: 'workplace negotiation',
          roles: [{ label: 'The Traveler', relationship: 'x' }],
        },
        cards: [
          {
            userId: ana.id,
            status: 'ready',
            roleLabel: 'The Traveler',
            background: 'x',
            objective: 'x',
            constraintText: 'x',
            register: 'neutral',
            targetExpressions: cardExpressions,
          },
        ],
      },
    );

    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis!.scenarioContext).toBe('full');
    expect(analysis!.scenarioFit).not.toBeNull();
    const fit = analysis!.scenarioFit!;
    expect(fit.roleLabel).toBe('The Traveler');
    expect(fit.registerExpected).toBe('neutral');
    const union = [...fit.expressionsUsed, ...fit.expressionsNotUsed].sort();
    expect(union).toEqual([...cardExpressions].sort());
    expect(fit.expressionsUsed.length + fit.expressionsNotUsed.length).toBe(cardExpressions.length);
  }, 60_000);

  it('no_scenario_omits_the_fit_and_invents_nothing', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(
      pipeline,
      [{ speaker: ana, utterances: [said('A perfectly ordinary sentence with no scenario at all.')] }],
      { scenario: { status: 'no_scenario' } },
    );

    // The default fake already respects `scenario_status` and returns
    // `scenario_fit: null` outside `full` — no script needed here.
    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const call = gemini.callsOf('analysis').find((c) => c.apiKey === ana.geminiKey)!;
    expect(call.message).toContain('No scenario was in play for this lesson.');
    expect(call.message).not.toContain('Setting:');

    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis!.scenarioContext).toBe('none');
    expect(analysis!.scenarioFit).toBeNull();
  }, 60_000);

  it('a_missing_card_analyses_with_the_situation_only', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(
      pipeline,
      [{ speaker: ana, utterances: [said('Talking without a role card yet.')] }],
      {
        scenario: {
          status: 'ready',
          setting: 'x',
          premise: 'x',
          vocabularyDomain: 'travel',
          roles: [{ label: 'The Traveler', relationship: 'x' }],
        },
        cards: [{ userId: ana.id, status: 'failed', roleLabel: 'The Traveler' }],
      },
    );

    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const call = gemini.callsOf('analysis').find((c) => c.apiKey === ana.geminiKey)!;
    expect(call.message).toContain('role card could not be generated');
    expect(call.message).toContain('The Traveler');

    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis!.scenarioContext).toBe('situation_only');
    expect(analysis!.scenarioFit).toBeNull();
  }, 60_000);

  it('a_long_transcript_is_truncated_with_the_note', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: false });
    const hugeOtherLine = 'z '.repeat(30_000); // ~60,000 chars, comfortably over the 12,000-token budget alone.
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('A short line from the owner.', 10_000, 14_000)] },
      { speaker: bruno, utterances: [said(hugeOtherLine, 0, 5_000)] },
    ]);

    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const call = gemini.callsOf('analysis').find((c) => c.apiKey === ana.geminiKey)!;
    expect(call.message).not.toContain('OTHER 1');
    expect(call.message).toContain('A short line from the owner.');
    expect(call.message).toContain('missing text that was never said');

    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis!.transcriptTruncated).toBe(true);
  }, 60_000);

  it('a_missing_key_blocks_only_analysis', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: false });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('hello')] }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startAnalysis(pipeline, branchId);
    const row = await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['blocked_missing_key']);

    expect(row.reasonCode).toBe('credential_missing');
    expect(gemini.callsOf('analysis')).toHaveLength(0);
    const analysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(analysis).toBeNull();
  }, 60_000);

  it('a_rejected_key_blocks_and_marks_the_credential_invalid', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('hello there')] }]);
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(ana.geminiKey!, { kind: 'status', status: 401, message: 'API_KEY_INVALID' });

    await startAnalysis(pipeline, branchId);
    const row = await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['blocked_missing_key']);
    expect(row.reasonCode).toBe('credential_rejected');

    const credential = await pipeline.ctx.prisma.userCredential.findUnique({
      where: { userId_provider: { userId: ana.id, provider: 'gemini' } },
    });
    expect(credential?.status).toBe('invalid');
  }, 60_000);

  it('two_schema_failures_fail_with_the_raw_response_retained', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('hello there Ana')] }]);
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(ana.geminiKey!, { kind: 'invalid' }, { kind: 'invalid' });

    await startAnalysis(pipeline, branchId);
    const row = await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['failed']);
    expect(row.reasonCode).toBe('analysis_invalid_output');

    const execution = await pipeline.ctx.prisma.promptExecution.findFirst({
      where: { userId: ana.id, promptId: 'lesson-analysis', outcome: 'validation_failed_hard_error' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(execution?.rawResponse).toBeTruthy();
    expect(row).toMatchObject({ status: 'failed' });

    // Retry with a healthy fake completes.
    gemini.analysisScripts.delete(ana.geminiKey!);
    const requeued = await pipeline.ctx.app.get(PipelineStateService).requeueFailed(row, new Date());
    await pipeline.ctx.app.get(PipelineQueueService).enqueue(branchId, 'lesson_analysis', requeued!.run);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);
  }, 60_000);

  it('quota_retries_then_fails', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('hello there Ana')] }]);
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(
      ana.geminiKey!,
      { kind: 'status', status: 429, message: 'RESOURCE_EXHAUSTED' },
      { kind: 'status', status: 429, message: 'RESOURCE_EXHAUSTED' },
      { kind: 'status', status: 429, message: 'RESOURCE_EXHAUSTED' },
      { kind: 'status', status: 429, message: 'RESOURCE_EXHAUSTED' },
    );

    await startAnalysis(pipeline, branchId);
    const row = await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['failed'], 30_000);
    expect(row.reasonCode).toBe('analysis_quota_exceeded');
    expect(gemini.callsOf('analysis').filter((c) => c.apiKey === ana.geminiKey)).toHaveLength(4);
  }, 60_000);

  it('one_participants_failure_does_not_block_the_other', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('Ana line here today.')] },
      { speaker: bruno, utterances: [said('Bruno line here today.')] },
    ]);
    gemini.scriptAnalysis(ana.geminiKey!, { kind: 'invalid' }, { kind: 'invalid' });

    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await startAnalysis(pipeline, lesson.branches.get(bruno.id)!);

    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['failed']);
    await waitForStage(pipeline.ctx, lesson.branches.get(bruno.id)!, 'lesson_analysis', ['completed']);

    expect(await reader().forParticipant(lesson.lessonId, ana.id)).toBeNull();
    expect(await reader().forParticipant(lesson.lessonId, bruno.id)).not.toBeNull();
  }, 60_000);

  it('completion_advances_to_profile_update', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('hello there Ana')] }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    // F12 registered the profile_update handler, so the queued stage runs at
    // once; the branch then rests at plan_generation, F15's stage.
    const nextRow = await waitForStage(pipeline.ctx, branchId, 'profile_update', ['completed']);
    expect(nextRow).toMatchObject({ run: 1 });
    const branch = await pipeline.ctx.prisma.lessonPipelineBranch.findUniqueOrThrow({ where: { id: branchId } });
    expect(branch).toMatchObject({ stage: 'plan_generation', status: 'queued' });
  }, 60_000);

  it('the_analysis_stamps_prompt_id_version_model_and_usage', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(pipeline, [{ speaker: ana, utterances: [said('hello there Ana')] }]);
    const branchId = lesson.branches.get(ana.id)!;

    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    const row = await pipeline.ctx.prisma.lessonAnalysis.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
    });
    expect(row.promptId).toBe('lesson-analysis');
    expect(row.promptVersion).toBe('2');
    expect(row.model).toBe('gemini-3.6-flash');
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('zero_errors_on_a_long_lesson_is_stored_and_flagged', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await makeAnalysisReadyLesson(
      pipeline,
      [{ speaker: ana, utterances: [said('A sentence that will not be quoted back by the fake below.')] }],
      { durationSeconds: 11 * 60 },
    );
    const branchId = lesson.branches.get(ana.id)!;
    gemini.scriptAnalysis(ana.geminiKey!, {
      kind: 'ok',
      response: {
        competencies: {
          grammar: { score: 90, justification: 'x' },
          vocabulary: { score: 90, justification: 'x' },
          fluency: { score: 90, justification: 'x' },
          interaction: { score: 90, justification: 'x' },
          comprehension: { score: 90, justification: 'x' },
        },
        strengths: ['a', 'b', 'c'],
        errors: [],
        recurring_tags: [],
        scenario_fit: null,
        topics_to_practice: ['a', 'b', 'c'],
      },
    });

    await startAnalysis(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'lesson_analysis', ['completed']);

    const row = await pipeline.ctx.prisma.lessonAnalysis.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: lesson.lessonId, userId: ana.id } },
    });
    expect(row.curatorFlags).toContain('no_errors_long_lesson');
  }, 60_000);

  it('the_reader_returns_the_analysis_for_the_profile', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const bruno = await seedSpeaker(pipeline.ctx, 'Bruno', { withGeminiKey: false });
    const lesson = await makeAnalysisReadyLesson(pipeline, [
      { speaker: ana, utterances: [said('Ana has an analysis and Bruno does not.')] },
      { speaker: bruno, utterances: [said('Bruno has no key at all.')] },
    ]);
    await startAnalysis(pipeline, lesson.branches.get(ana.id)!);
    await waitForStage(pipeline.ctx, lesson.branches.get(ana.id)!, 'lesson_analysis', ['completed']);

    const anaAnalysis = await reader().forParticipant(lesson.lessonId, ana.id);
    expect(anaAnalysis).not.toBeNull();
    expect(anaAnalysis!.errors.every((error) => typeof error.tag === 'string')).toBe(true);

    const brunoAnalysis = await reader().forParticipant(lesson.lessonId, bruno.id);
    expect(brunoAnalysis).toBeNull();
  }, 60_000);
});
