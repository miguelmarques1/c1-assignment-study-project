import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import type { PromptExecutionResult } from '../../src/prompts/prompt-types';
import { PromptExecutionService } from '../../src/prompts/prompt-execution.service';
import { fiveQuestions } from './helpers/content-fixtures';
import {
  createPipelineTestContext,
  makeProfileUpdateReadyLesson,
  resetPipelineTables,
  seedSpeaker,
  startProfileUpdate,
  waitForStage,
  type PipelineTestContext,
  type SeedUtterance,
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
  // Not part of resetPipelineTables' scope (a different domain, F13's), and
  // every test here seeds the same slug.
  await pipeline.ctx.prisma.contentItem.deleteMany({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function said(text: string, startMs = 0, endMs = 4_000): SeedUtterance {
  return { startMs, endMs, text, confidence: 0.9 };
}

async function seedCuratedItem(overrides: { slug: string; type: 'reading' | 'grammar'; targetTags: string[] }) {
  return pipeline.ctx.prisma.contentItem.create({
    data: {
      slug: overrides.slug,
      type: overrides.type,
      provenance: 'curated',
      cefrLevel: 'C1',
      title: `Title for ${overrides.slug}`,
      topic: 'housing',
      difficulty: 4,
      skills: [overrides.type === 'reading' ? 'reading' : 'grammar', 'grammar'],
      body: 'Some authentic-looking prose that stands in for a real curated passage in this test.',
      wordCount: 500,
      questions: fiveQuestions() as never,
      targetTags: overrides.targetTags,
      sourceName: 'Test fixture',
    },
  });
}

/**
 * `study-plan-compose` has no dedicated fake-SDK responder (unlike
 * `lesson-analysis` and the four `*-generate` prompts) — an unrecognised
 * schema falls through the fake's `kindOf` default and returns a
 * scenario-card-shaped body, so a real key would always fail schema
 * validation and the model path would never actually run in these tests.
 * Scripting `PromptExecutionService.execute` directly for this one promptId,
 * per test below, sidesteps that gap without touching the shared SDK fake
 * other suites rely on. The alias is read back out of the real rendered
 * `candidates` variable, so the script stays correct no matter what F14
 * generation (which also runs for a keyed user) adds to the offer.
 */
function firstOfferedAlias(variables: Record<string, string>): string {
  const match = /^(c\d+)/m.exec(variables.candidates ?? '');
  if (!match) {
    throw new Error('No offered candidate found in the rendered prompt variables.');
  }
  return match[1]!;
}

async function buildDeterministicSetup(ana: Awaited<ReturnType<typeof seedSpeaker>>) {
  await seedCuratedItem({ slug: 'det-reading-1', type: 'reading', targetTags: ['grammar:conditional-3'] });
  const lesson = await makeProfileUpdateReadyLesson(pipeline, [
    {
      speaker: ana,
      utterances: [said('If I would have known I would have come.')],
      pronunciation: { status: 'assessed', scores: { pronunciation: 72, accuracy: 81, prosody: 66, fluency: 90, completeness: 95 } },
      analysis: { errors: [{ tag: 'grammar:conditional-3', quote: 'If I would have known I would have come.', utteranceIdx: 0 }] },
    },
  ]);
  return lesson;
}

describe('plan composition modes (F15)', () => {
  it('a_missing_gemini_key_still_produces_a_deterministic_plan_with_the_note', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana');
    const lesson = await buildDeterministicSetup(ana);
    const branchId = lesson.branches.get(ana.id)!;

    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    });
    expect(plan.composition).toBe('deterministic');
    expect(plan.deterministicReason).toBe('gemini_key_missing');
    const notes = plan.notes as Array<{ code: string; text: string }>;
    expect(notes.some((note) => note.code === 'gemini_key_missing' && /Gemini key is missing/.test(note.text))).toBe(true);
  }, 60_000);

  it('unknown_refs_from_the_model_are_rejected_and_replaced_from_the_bank', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await buildDeterministicSetup(ana);
    const branchId = lesson.branches.get(ana.id)!;

    let capturedVariables: Record<string, string> | null = null;
    const original = PromptExecutionService.prototype.execute;
    vi.spyOn(PromptExecutionService.prototype, 'execute').mockImplementation(function (
      this: PromptExecutionService,
      userId: string,
      promptId: string,
      variables: Record<string, string>,
      options?: unknown,
    ) {
      if (promptId !== 'study-plan-compose') {
        return original.call(this, userId, promptId, variables, options as never);
      }
      capturedVariables = variables;
      const alias = firstOfferedAlias(variables);
      const result: PromptExecutionResult = {
        data: { selections: [{ ref: alias, rationale: 'A model rationale long enough to pass the acceptance check here.' }, { ref: 'zz99', rationale: 'Unknown.' }] },
        promptId: 'study-plan-compose',
        promptVersion: '2',
        model: 'gemini-test',
        retried: false,
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 5,
      };
      return Promise.resolve(result);
    });

    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);
    expect(capturedVariables).not.toBeNull();

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    });
    // Exactly one unknown ref out of two returned is not "more than half" (A8), so the model's output still stands.
    expect(plan.composition).toBe('model');
    const stats = plan.modelSelectionStats as { rejected: { unknown: number } };
    expect(stats.rejected.unknown).toBe(1);
  }, 60_000);

  it('more_than_half_invalid_discards_the_models_output', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await buildDeterministicSetup(ana);
    const branchId = lesson.branches.get(ana.id)!;

    const original = PromptExecutionService.prototype.execute;
    vi.spyOn(PromptExecutionService.prototype, 'execute').mockImplementation(function (
      this: PromptExecutionService,
      userId: string,
      promptId: string,
      variables: Record<string, string>,
      options?: unknown,
    ) {
      if (promptId !== 'study-plan-compose') {
        return original.call(this, userId, promptId, variables, options as never);
      }
      const alias = firstOfferedAlias(variables);
      const result: PromptExecutionResult = {
        data: {
          selections: [
            { ref: alias, rationale: 'A model rationale long enough to pass the acceptance check here.' },
            { ref: 'zz98', rationale: 'Unknown.' },
            { ref: 'zz99', rationale: 'Unknown.' },
          ],
        },
        promptId: 'study-plan-compose',
        promptVersion: '2',
        model: 'gemini-test',
        retried: false,
        inputTokens: 10,
        outputTokens: 10,
        latencyMs: 5,
      };
      return Promise.resolve(result);
    });

    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    });
    // Two of three (67%) rejected is more than half: the whole output is discarded (A8).
    expect(plan.composition).toBe('deterministic');
    expect(plan.deterministicReason).toBe('model_output_invalid');
  }, 60_000);

  it('a_rejected_key_still_composes_deterministically', async () => {
    const ana = await seedSpeaker(pipeline.ctx, 'Ana', { withGeminiKey: true });
    const lesson = await buildDeterministicSetup(ana);
    const branchId = lesson.branches.get(ana.id)!;

    const original = PromptExecutionService.prototype.execute;
    vi.spyOn(PromptExecutionService.prototype, 'execute').mockImplementation(function (
      this: PromptExecutionService,
      userId: string,
      promptId: string,
      variables: Record<string, string>,
      options?: unknown,
    ) {
      if (promptId !== 'study-plan-compose') {
        return original.call(this, userId, promptId, variables, options as never);
      }
      const error = new Error('API_KEY_INVALID: the provided key is not valid') as Error & { status: number };
      error.status = 401;
      return Promise.reject(error);
    });

    await startProfileUpdate(pipeline, branchId);
    await waitForStage(pipeline.ctx, branchId, 'plan_generation', ['completed']);

    const plan = await pipeline.ctx.prisma.studyPlan.findUniqueOrThrow({
      where: { userId_lessonId_origin: { userId: ana.id, lessonId: lesson.lessonId, origin: 'lesson' } },
    });
    expect(plan.composition).toBe('deterministic');
    expect(plan.deterministicReason).toBe('gemini_key_rejected');
  }, 60_000);
});
