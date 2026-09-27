import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { collectGenerationStats, renderGenerationStats } from '../../src/generation/generation-stats';
import { createTestContext, type TestContext } from './helpers/test-app';

let ctx: TestContext;
let userId: string;
/** Slots that ended with an item must point at one (`ck_generation_slots_item`). */
let itemId: string;

type Attempt = { outcome: string; version?: string; checks?: string[]; metrics?: Record<string, number> };

/** A slot with its attempts, written directly: the stats read rows, whatever produced them. */
async function slotWith(runId: string, position: number, status: string, reason: string | null, attempts: Attempt[]) {
  await ctx.prisma.contentGenerationSlot.create({
    data: {
      runId,
      userId,
      position,
      type: 'grammar',
      targetTags: ['grammar:passive-voice'],
      tagSources: [],
      topicDomain: 'housing',
      exemplarIndex: 0,
      status,
      reason,
      contentItemId: status === 'generated' || status === 'fallback' ? itemId : null,
      completedAt: status === 'pending' ? null : new Date(),
      attemptCount: attempts.length,
      attempts: {
        create: attempts.map((attempt, index) => ({
          attempt: index + 1,
          promptId: 'grammar-generate',
          promptVersion: attempt.version ?? '2',
          outcome: attempt.outcome,
          failedChecks: attempt.checks ?? [],
          gateMetrics: attempt.outcome === 'passed' || attempt.outcome === 'gate_failed' ? (attempt.metrics ?? { word_count: 300 }) : undefined,
        })),
      },
    },
  });
}

async function run(key: string, abandonReason: string | null = null) {
  return ctx.prisma.contentGenerationRun.create({
    data: {
      userId,
      runKey: key,
      maxItems: 12,
      abandonReason,
      status: 'completed',
      finishedAt: new Date(),
      rulesVersion: '1',
      rulesFingerprint: 'f'.repeat(64),
      frequencyListVersion: 'en-lemmas-top5000@000000000000',
      taxonomyVersion: '2',
    },
  });
}

beforeAll(async () => {
  ctx = await createTestContext();
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.contentGenerationRun.deleteMany();
  await ctx.prisma.contentItem.deleteMany();
  await ctx.prisma.user.deleteMany();
  itemId = (
    await ctx.prisma.contentItem.create({
      data: {
        slug: 'gen-grammar-000000000001',
        type: 'grammar',
        provenance: 'generated',
        cefrLevel: 'C1',
        title: 'Stats fixture',
        topic: 'housing',
        skills: ['grammar', 'reading'],
        difficulty: 4,
        body: 'A body.',
        questions: [{}, {}, {}, {}, {}],
        targetTags: ['grammar:passive-voice'],
        promptId: 'grammar-generate',
        promptVersion: '2',
        gateMetrics: { word_count: 300 },
      },
    })
  ).id;
  userId = (await ctx.prisma.user.create({ data: { email: 'curator@example.com', displayName: 'Curator', passwordHash: 'x'.repeat(60) } })).id;
});

describe('generation stats', () => {
  it('reports_first_pass_and_within_regeneration_rates_per_prompt_version', async () => {
    const { id } = await run('r1');
    const pass = { outcome: 'passed', metrics: { word_count: 320, mean_sentence_length: 21, type_token_ratio: 0.6, out_of_frequency_ratio: 0.14 } };
    await slotWith(id, 1, 'generated', null, [pass]);
    await slotWith(id, 2, 'generated', null, [{ outcome: 'gate_failed', checks: ['word_count'] }, pass]);
    await slotWith(id, 3, 'fallback', 'gate_failed_twice', [{ outcome: 'gate_failed', checks: ['word_count'] }, { outcome: 'gate_failed', checks: ['banned_phrases'] }]);
    await slotWith(id, 4, 'generated', null, [{ outcome: 'passed', version: '3' }]);
    // Never reached the gate: excluded.
    await slotWith(id, 5, 'dropped', 'quota_exhausted', [{ outcome: 'quota_exhausted' }]);
    await slotWith(id, 6, 'dropped', 'credential_missing', []);

    const stats = await collectGenerationStats(ctx.prisma);

    const v2 = stats.versions.find((version) => version.promptVersion === '2')!;
    expect(v2).toMatchObject({ promptId: 'grammar-generate', slots: 3, discarded: 1 });
    expect(v2.firstPassRate).toBeCloseTo(1 / 3);
    expect(v2.withinRegenerationRate).toBeCloseTo(2 / 3);
    expect(stats.versions.find((version) => version.promptVersion === '3')).toMatchObject({ slots: 1, firstPassRate: 1 });
  });

  it('ranks_the_most_frequent_failed_checks', async () => {
    const { id } = await run('r1');
    await slotWith(id, 1, 'fallback', 'gate_failed_twice', [
      { outcome: 'gate_failed', checks: ['out_of_frequency_ratio', 'target_structures'] },
      { outcome: 'gate_failed', checks: ['out_of_frequency_ratio'] },
    ]);

    const [version] = (await collectGenerationStats(ctx.prisma)).versions;

    expect(version!.failedChecks).toEqual([
      { check: 'out_of_frequency_ratio', count: 2 },
      { check: 'target_structures', count: 1 },
    ]);
  });

  it('reports_mean_metrics_of_passing_items', async () => {
    const { id } = await run('r1');
    await slotWith(id, 1, 'generated', null, [{ outcome: 'passed', metrics: { word_count: 300, mean_sentence_length: 20, type_token_ratio: 0.5, out_of_frequency_ratio: 0.12 } }]);
    await slotWith(id, 2, 'generated', null, [{ outcome: 'passed', metrics: { word_count: 400, mean_sentence_length: 24, type_token_ratio: 0.6, out_of_frequency_ratio: 0.16 } }]);

    const stats = await collectGenerationStats(ctx.prisma);

    expect(stats.versions[0]!.passingMeans).toEqual({ wordCount: 350, meanSentenceLength: 22, typeTokenRatio: 0.55, outOfFrequencyRatio: expect.closeTo(0.14) });
    expect(renderGenerationStats(stats).join('\n')).toContain('Passing means: grammar-generate v2 — 350 words, MSL 22.0, TTR 0.55, OOF 14.0%');
  });

  it('counts_abandoned_runs_by_reason', async () => {
    await run('r1');
    await run('r2', 'credential_missing');
    await run('r3', 'quota_exhausted');

    const stats = await collectGenerationStats(ctx.prisma);

    expect(stats.runs).toBe(3);
    expect(stats.abandoned).toEqual({ credential_missing: 1, quota_exhausted: 1 });
    expect(renderGenerationStats(stats).join('\n')).toContain('Runs: 3 (abandoned: 1 credential missing, 1 quota)');
  });

  it('section_is_omitted_when_no_run_exists', async () => {
    expect(renderGenerationStats(await collectGenerationStats(ctx.prisma))).toEqual([]);
  });
});
