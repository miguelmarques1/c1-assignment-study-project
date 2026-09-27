import { vi } from 'vitest';

vi.mock('@google/genai', async () => (await import('./helpers/fake-gemini')).fakeGeminiModule);

import { Logger } from '@nestjs/common';
import type { GeneratedContentType } from '@english-quest/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ContentBankService } from '../../src/content/content-bank.service';
import { ContentGenerationService } from '../../src/generation/content-generation.service';
import { GENERATION_NOTES, GENERATION_PROMPT_IDS } from '../../src/generation/generation.constants';
import { ErrorLedgerReader } from '../../src/profile/error-ledger.reader';
import { PromptRegistryService } from '../../src/prompts/prompt-registry.service';
import { responseForSlot } from '../fixtures/generation/fixtures';
import { gemini, generationTypeOf } from './helpers/fake-gemini';
import {
  COVERED_TAGS,
  createGenerationTestContext,
  resetGenerationTables,
  seedCurated,
  seedLedger,
  seededRng,
  standardLedger,
} from './helpers/generation-fixtures';
import { seedUser, type SeededUser } from './helpers/scenario-fixtures';
import type { TestContext } from './helpers/test-app';

let ctx: TestContext;
let service: ContentGenerationService;
let alice: SeededUser;

/** A reading answer that fails the gate on a banned phrase, the easiest failure to recognise. */
function failingReading() {
  const response = responseForSlot('reading', [COVERED_TAGS.conditional3, COVERED_TAGS.collocation]);
  return { ...response, body: `${response.body}\n\nIn conclusion, the council should think again.` };
}

async function slotsOf(runId: string) {
  return ctx.prisma.contentGenerationSlot.findMany({ where: { runId }, orderBy: { position: 'asc' }, include: { attempts: { orderBy: { attempt: 'asc' } } } });
}

beforeAll(async () => {
  ctx = await createGenerationTestContext();
  service = ctx.app.get(ContentGenerationService);
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  gemini.reset();
  service.rng = seededRng(1);
  await resetGenerationTables(ctx);
  alice = await seedUser(ctx, 'alice@example.com', 'Alice');
  await seedLedger(ctx, alice.id, standardLedger('A'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content generation', () => {
  it('generates_reading_vocabulary_grammar_and_error_review_and_never_listening', async () => {
    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    const generatedTypes = new Set(result.slots.filter((slot) => slot.outcome === 'generated').map((slot) => slot.type));
    expect([...generatedTypes].sort()).toEqual(['error_review', 'grammar', 'reading', 'vocabulary']);
    expect(result.counts.generated).toBe(result.counts.planned);
    expect(await ctx.prisma.contentItem.count({ where: { type: 'listening' } })).toBe(0);
    expect(result.slots.every((slot) => slot.type !== ('listening' as GeneratedContentType))).toBe(true);
  });

  it('persists_each_passing_item_with_provenance_tags_metrics_and_prompt_stamp', async () => {
    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });
    const registry = ctx.app.get(PromptRegistryService);

    for (const slot of result.slots.filter((entry) => entry.outcome === 'generated')) {
      const item = await ctx.prisma.contentItem.findUniqueOrThrow({ where: { id: slot.contentItemId! } });
      const metrics = item.gateMetrics as Record<string, unknown>;
      expect(item.provenance).toBe('generated');
      expect(item.type).toBe(slot.type);
      expect(item.targetTags).toEqual(slot.targetTags);
      expect(item.promptId).toBe(GENERATION_PROMPT_IDS[slot.type]);
      expect(item.promptVersion).toBe(registry.get(GENERATION_PROMPT_IDS[slot.type]).version);
      expect(metrics).toMatchObject({ rules_version: '1', frequency_list: expect.stringMatching(/^en-lemmas-top5000@/) });
      expect(Object.values(metrics.checks as Record<string, string>).every((check) => check === 'pass')).toBe(true);
      expect((metrics.answer_evidence as string[]).length).toBe(5);
    }
  });

  it('generated_items_are_returned_as_bank_candidates', async () => {
    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });
    const bank = ctx.app.get(ContentBankService);
    const ids = result.slots.flatMap((slot) => (slot.contentItemId ? [slot.contentItemId] : []));

    const candidates = await bank.findCandidates({ userId: alice.id, provenance: 'generated' });
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual([...ids].sort());
    expect([...(await bank.existingIds(ids))].sort()).toEqual([...ids].sort());
  });

  it('every_generated_items_target_tags_are_unmastered_for_its_owner', async () => {
    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });
    const unmastered = await ctx.app.get(ErrorLedgerReader).unmasteredTags(alice.id);

    for (const slot of result.slots) {
      expect(slot.targetTags.every((tag) => unmastered.includes(tag))).toBe(true);
    }
    // The top recurring weakness is the first slot's first target.
    expect(result.slots[0]?.targetTags[0]).toBe(COVERED_TAGS.conditional3);
    expect(result.slots[0]?.tagSources[0]).toMatchObject({ tag: COVERED_TAGS.conditional3, source: 'recurring', rank: 1 });
  });

  it('regenerates_a_failing_item_once_with_the_failed_checks_appended', async () => {
    gemini.scriptGeneration(alice.geminiKey!, { kind: 'ok', response: failingReading() });

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one', maxItems: 1 });

    const calls = gemini.callsOf('generation');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.message).not.toContain('Correction needed: your previous draft failed');
    expect(calls[1]!.message).toContain('Correction needed: your previous draft failed these checks.');
    expect(calls[1]!.message).toContain('banned_phrases: remove "in conclusion" (1)');
    expect(result.slots[0]).toMatchObject({ outcome: 'generated', attempts: 2 });
    const [slot] = await slotsOf(result.runId);
    expect(slot!.attempts.map((attempt) => [attempt.outcome, attempt.failedChecks])).toEqual([
      ['gate_failed', ['banned_phrases']],
      ['passed', []],
    ]);
  });

  it('an_item_failing_twice_is_replaced_by_a_curated_item_of_the_same_type', async () => {
    const curated = await seedCurated(ctx, 'reading', 'curated-council-letter', [COVERED_TAGS.conditional3]);
    await seedCurated(ctx, 'reading', 'curated-unrelated', [COVERED_TAGS.passive]);
    gemini.scriptGeneration(alice.geminiKey!, { kind: 'ok', response: failingReading() }, { kind: 'ok', response: failingReading() });

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one', maxItems: 1 });

    expect(result.slots[0]).toMatchObject({ type: 'reading', outcome: 'fallback', contentItemId: curated.id, reason: 'gate_failed_twice', attempts: 2 });
    expect(await ctx.prisma.contentItem.count({ where: { provenance: 'generated' } })).toBe(0);
    const [slot] = await slotsOf(result.runId);
    for (const attempt of slot!.attempts) {
      expect(attempt).toMatchObject({ outcome: 'gate_failed', promptId: 'reading-generate', promptVersion: '2' });
      expect(attempt.gateMetrics).toMatchObject({ word_count: expect.any(Number), out_of_frequency_ratio: expect.any(Number) });
    }
  });

  it('a_slot_without_a_curated_fallback_is_dropped', async () => {
    // Schema-valid but over the banned-phrase line, so it is the gate (not F04) that refuses it twice.
    gemini.generationResponder = ({ message }) => {
      if (generationTypeOf(message) !== 'error_review') {
        return undefined;
      }
      const response = responseForSlot('error_review', [COVERED_TAGS.connector]);
      return { kind: 'ok', response: { ...response, body: `${response.body} In conclusion, the gamble is worth it.` } };
    };

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one', maxItems: 4 });

    const review = result.slots.find((slot) => slot.type === 'error_review');
    expect(review).toMatchObject({ outcome: 'dropped', contentItemId: null, reason: 'gate_failed_twice', attempts: 2 });
    expect(result.counts.dropped).toBe(1);
  });

  it('a_second_call_with_the_same_run_key_makes_no_model_call', async () => {
    const first = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });
    const callsAfterFirst = gemini.callsOf('generation').length;

    const second = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    expect(second).toEqual(first);
    expect(gemini.callsOf('generation')).toHaveLength(callsAfterFirst);
    expect(await ctx.prisma.contentGenerationRun.count()).toBe(1);
  });

  it('rejects_more_than_twelve_items', async () => {
    await expect(service.generateForPlan({ userId: alice.id, runKey: 'lesson:one', maxItems: 13 })).rejects.toMatchObject({ code: 'VAL001' });
    await expect(service.generateForPlan({ userId: alice.id, runKey: 'bad key!' })).rejects.toMatchObject({ code: 'VAL001' });
    expect(await ctx.prisma.contentGenerationRun.count()).toBe(0);
    expect(gemini.callsOf('generation')).toHaveLength(0);
  });

  it('resumes_an_expired_slot_without_a_third_attempt', async () => {
    // A run whose worker died after one failed attempt, holding its only slot for twenty minutes.
    const run = await ctx.prisma.contentGenerationRun.create({
      data: {
        userId: alice.id,
        runKey: 'lesson:crashed',
        maxItems: 1,
        rulesVersion: '1',
        rulesFingerprint: 'f'.repeat(64),
        frequencyListVersion: 'en-lemmas-top5000@000000000000',
        taxonomyVersion: '2',
        slots: {
          create: {
            userId: alice.id,
            position: 1,
            type: 'reading',
            targetTags: [COVERED_TAGS.conditional3, COVERED_TAGS.collocation],
            tagSources: [],
            genre: 'obituary',
            topicDomain: 'housing',
            exemplarIndex: 0,
            status: 'running',
            claimedAt: new Date(Date.now() - 20 * 60 * 1000),
            attemptCount: 1,
            attempts: {
              create: {
                attempt: 1,
                promptId: 'reading-generate',
                promptVersion: '2',
                outcome: 'gate_failed',
                failedChecks: ['word_count'],
                gateMetrics: { word_count: 300, failures: [{ check: 'word_count', measured: 300, min: 450, max: 700 }] },
              },
            },
          },
        },
      },
    });

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:crashed' });

    expect(result.runId).toBe(run.id);
    const calls = gemini.callsOf('generation');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toContain('word_count: the text has 300 words; it must have between 450 and 700.');
    expect(result.slots[0]).toMatchObject({ outcome: 'generated', attempts: 2 });
  });

  it('missing_gemini_key_makes_no_call_and_returns_curated_fallbacks_with_the_note', async () => {
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob', { withKey: false });
    await seedLedger(ctx, bob.id, standardLedger('B'));
    await seedCurated(ctx, 'reading', 'curated-reading', [COVERED_TAGS.conditional3]);
    await seedCurated(ctx, 'grammar', 'curated-grammar', [COVERED_TAGS.passive]);

    const result = await service.generateForPlan({ userId: bob.id, runKey: 'lesson:one' });

    expect(gemini.callsOf('generation')).toHaveLength(0);
    expect(result.abandonReason).toBe('credential_missing');
    expect(result.notes).toEqual([{ code: 'gemini_key_missing', text: 'Some activities use existing material because your Gemini key is missing.' }]);
    expect(result.counts.generated).toBe(0);
    expect(result.slots.every((slot) => slot.reason === 'credential_missing' && slot.outcome !== 'generated')).toBe(true);
    expect(result.slots.filter((slot) => slot.outcome === 'fallback').length).toBeGreaterThan(0);
  });

  it('rejected_key_mid_run_keeps_generated_items_and_abandons_the_rest', async () => {
    gemini.generationResponder = ({ index }) =>
      index === 1 ? undefined : { kind: 'status', status: 400, message: 'API key not valid. Please pass a valid API key.' };

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    expect(result.abandonReason).toBe('credential_rejected');
    expect(result.counts.generated).toBe(1);
    expect(gemini.callsOf('generation').length).toBeLessThan(result.counts.planned);
    expect(result.notes[0]?.code).toBe('gemini_key_missing');
    const credential = await ctx.prisma.userCredential.findFirstOrThrow({ where: { userId: alice.id, provider: 'gemini' } });
    expect(credential.status).toBe('invalid');
  });

  it('quota_exhausted_mid_batch_keeps_generated_items_and_falls_back_for_the_rest', async () => {
    gemini.generationResponder = ({ index }) => (index === 1 ? undefined : { kind: 'status', status: 429, message: 'RESOURCE_EXHAUSTED' });

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    expect(result.abandonReason).toBe('quota_exhausted');
    expect(result.counts.generated).toBe(1);
    expect(gemini.callsOf('generation').length).toBeLessThan(result.counts.planned);
    const rest = result.slots.filter((slot) => slot.outcome !== 'generated');
    expect(rest.every((slot) => slot.reason === 'quota_exhausted')).toBe(true);
    expect(result.notes).toEqual([{ code: 'gemini_quota_exhausted', text: GENERATION_NOTES.gemini_quota_exhausted }]);
    expect(await ctx.prisma.contentItem.count({ where: { provenance: 'generated' } })).toBe(1);
  });

  it('uses_only_the_owners_gemini_key', async () => {
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    await seedLedger(ctx, bob.id, standardLedger('B'));

    await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    const keys = new Set(gemini.callsOf('generation').map((call) => call.apiKey));
    expect([...keys]).toEqual([alice.geminiKey]);
  });

  it('error_review_prompt_carries_only_the_owners_quotes_and_no_summary', async () => {
    const bob = await seedUser(ctx, 'bob@example.com', 'Bob');
    await seedLedger(ctx, bob.id, standardLedger('B'));

    await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    const calls = gemini.callsOf('generation');
    const reviews = calls.filter((call) => generationTypeOf(call.message) === 'error_review');
    const others = calls.filter((call) => generationTypeOf(call.message) !== 'error_review');
    expect(reviews.length).toBeGreaterThan(0);
    for (const call of reviews) {
      expect(call.message).toMatch(/A: /);
    }
    for (const call of calls) {
      expect(call.message).not.toMatch(/B: /);
      expect(call.message).not.toMatch(/Recurring weaknesses|warming up/i);
    }
    for (const call of others) {
      expect(call.message).not.toMatch(/A: /);
    }
  });

  it('an_item_reproducing_a_learner_quote_is_never_persisted', async () => {
    const leaked = 'I was exhausted, however I kept working until midnight';
    gemini.generationResponder = ({ message }) => {
      if (generationTypeOf(message) !== 'error_review') {
        return undefined;
      }
      const response = responseForSlot('error_review', [COVERED_TAGS.connector, COVERED_TAGS.presentPerfect, COVERED_TAGS.conditional3, COVERED_TAGS.passive, COVERED_TAGS.collocation]);
      return { kind: 'ok', response: { ...response, body: response.body.replace('The decision was not taken lightly.', `The decision was not taken lightly. ${leaked}.`) } };
    };

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one', maxItems: 4 });

    const review = result.slots.find((slot) => slot.type === 'error_review')!;
    expect(review).toMatchObject({ outcome: 'dropped', reason: 'gate_failed_twice' });
    const [slot] = (await slotsOf(result.runId)).filter((entry) => entry.type === 'error_review');
    expect(slot!.attempts.every((attempt) => attempt.failedChecks.includes('learner_quotes'))).toBe(true);
    const items = await ctx.prisma.contentItem.findMany();
    expect(items.some((item) => item.body?.includes('kept working until midnight'))).toBe(false);
  });

  it('no_genre_repeats_within_the_last_five_generated_readings_across_runs', async () => {
    // The window is the rule's own: the user's last 5 generated readings, by completion.
    const lastFiveReadings = async () =>
      (
        await ctx.prisma.contentGenerationSlot.findMany({
          where: { userId: alice.id, type: 'reading', status: 'generated' },
          orderBy: { completedAt: 'desc' },
          take: 5,
        })
      ).map((slot) => slot.genre!);

    let readings = 0;
    for (let run = 1; run <= 4; run += 1) {
      const window = new Set(await lastFiveReadings());
      const result = await service.generateForPlan({ userId: alice.id, runKey: `lesson:${run}` });
      const genres = result.slots.filter((slot) => slot.type === 'reading').map((slot) => slot.genre!);
      expect(genres.some((genre) => window.has(genre))).toBe(false);
      expect(new Set(genres).size).toBe(genres.length);
      readings += genres.length;
    }
    expect(readings).toBeGreaterThan(5);
  });

  it('rotates_exemplars_across_generations', async () => {
    await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one' });

    const readings = gemini.callsOf('generation').filter((call) => generationTypeOf(call.message) === 'reading');
    const exemplarTitle = (message: string) => /"title":"([^"]+)"/.exec(message)?.[1];
    expect(readings.length).toBeGreaterThanOrEqual(2);
    for (const call of readings) {
      expect(call.message.match(/Example \d+\n/g)).toHaveLength(1);
    }
    expect(new Set(readings.map((call) => exemplarTitle(call.message))).size).toBe(readings.length);
  });

  it('reports_progress_after_each_terminal_slot', async () => {
    const progress: Array<[number, number]> = [];

    const result = await service.generateForPlan({
      userId: alice.id,
      runKey: 'lesson:one',
      onProgress: (done, total) => {
        progress.push([done, total]);
      },
    });

    expect(progress).toHaveLength(result.counts.planned);
    expect(progress.map(([done]) => done)).toEqual(result.slots.map((_, index) => index + 1));
    expect(progress.every(([, total]) => total === result.counts.planned)).toBe(true);
  });

  it('discarded_items_are_logged_with_prompt_version_and_metrics', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    gemini.scriptGeneration(alice.geminiKey!, { kind: 'ok', response: failingReading() }, { kind: 'ok', response: failingReading() });

    const result = await service.generateForPlan({ userId: alice.id, runKey: 'lesson:one', maxItems: 1 });

    const line = warn.mock.calls.map((call) => String(call[0])).find((message) => message.startsWith('Discarded reading slot 1'));
    expect(line).toContain('under reading-generate v2');
    expect(line).toContain('attempt 1: gate_failed (banned_phrases); attempt 2: gate_failed (banned_phrases)');
    expect(line).not.toContain('council');
    const [slot] = await slotsOf(result.runId);
    for (const attempt of slot!.attempts) {
      const metrics = attempt.gateMetrics as Record<string, unknown>;
      expect(metrics.word_count).toEqual(expect.any(Number));
      expect(metrics).not.toHaveProperty('answer_evidence');
      expect(JSON.stringify(metrics)).not.toContain('Marlowe');
    }
  });
});
