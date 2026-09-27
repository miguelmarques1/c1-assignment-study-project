import { randomUUID } from 'node:crypto';

import type { ContentItem } from '@prisma/client';

import { ContentItemRepository } from '../../../src/content/content-item.repository';
import { validateCuratedMeta } from '../../../src/content/content-item.validation';
import { ProfileIngestionService } from '../../../src/profile/profile-ingestion.service';
import { ErrorTaxonomyService } from '../../../src/taxonomy/error-taxonomy.service';
import { grammarMeta, readingMeta, vocabularyMeta } from './content-fixtures';
import { createScenarioTestContext } from './scenario-fixtures';
import type { TestContext } from './test-app';

/**
 * Fixtures for F14's integration suite. The app boots like the scenario
 * suites (real prompt files loaded), the ledger is written through F12's own
 * ingestion, and curated fallbacks through F13's own validation and
 * repository, so nothing here bypasses a rule the product relies on.
 */

/** The prompt registry loaded from the real files, as `main.ts` does. */
export function createGenerationTestContext(): Promise<TestContext> {
  return createScenarioTestContext();
}

/**
 * Tags covered by both fixture passages, so any slot type the planner gives
 * them passes the gate with the default fake answer.
 */
export const COVERED_TAGS = {
  conditional3: 'grammar:conditional-3',
  passive: 'grammar:passive-voice',
  presentPerfect: 'grammar:present-perfect',
  collocation: 'vocab:collocation',
  connector: 'discourse:connector',
} as const;

export interface LedgerSeed {
  tag: string;
  count: number;
  quote?: string;
  correction?: string;
}

/** Writes each tag's occurrences into the user's ledger through F12's activity ingestion. */
export async function seedLedger(ctx: TestContext, userId: string, seeds: readonly LedgerSeed[]): Promise<void> {
  await ctx.app.get(ProfileIngestionService).ingestActivityOutcome({
    userId,
    activityId: randomUUID(),
    sourceKey: randomUUID(),
    activityType: 'grammar',
    occurredAt: new Date(Date.now() - 60_000),
    measurements: [],
    errorOccurrences: seeds.flatMap((seed) =>
      Array.from({ length: seed.count }, () => ({
        tag: seed.tag,
        ...(seed.quote ? { quote: seed.quote } : {}),
        ...(seed.correction ? { correction: seed.correction } : {}),
      })),
    ),
    correctEncounters: [],
  });
}

/** The standard ledger: five covered tags, three of them recurring, each with its own quote. */
export function standardLedger(prefix = 'A'): LedgerSeed[] {
  return [
    { tag: COVERED_TAGS.conditional3, count: 4, quote: `${prefix}: if I would have known I would call you back`, correction: `${prefix}: if I had known, I would have called you back` },
    { tag: COVERED_TAGS.passive, count: 3, quote: `${prefix}: the report was write by our manager last week`, correction: `${prefix}: the report was written by our manager last week` },
    { tag: COVERED_TAGS.collocation, count: 3, quote: `${prefix}: we did a big mistake with the supplier contract`, correction: `${prefix}: we made a big mistake with the supplier contract` },
    { tag: COVERED_TAGS.connector, count: 2, quote: `${prefix}: I was exhausted, however I kept working until midnight`, correction: `${prefix}: I was exhausted; however, I kept working until midnight` },
    { tag: COVERED_TAGS.presentPerfect, count: 2, quote: `${prefix}: I live in this flat since my brother moved abroad`, correction: `${prefix}: I have lived in this flat since my brother moved abroad` },
  ];
}

type CuratedType = 'reading' | 'grammar' | 'vocabulary';

/** A curated bank item through F13's validation and repository, as the importer writes it. */
export async function seedCurated(ctx: TestContext, type: CuratedType, slug: string, targetTags: string[]): Promise<ContentItem> {
  const base = type === 'reading' ? readingMeta() : type === 'grammar' ? grammarMeta() : vocabularyMeta();
  const meta = { ...base, target_tags: targetTags };
  const validated = validateCuratedMeta(type, meta, ctx.app.get(ErrorTaxonomyService).current());
  if (!validated.ok) {
    throw new Error(validated.issues.map((issue) => `${issue.path} ${issue.message}`).join('; '));
  }
  await new ContentItemRepository(ctx.prisma).upsertCurated({ type, slug, meta: validated.value, media: null });
  return ctx.prisma.contentItem.findUniqueOrThrow({ where: { slug } });
}

/** Everything the suite writes, children first (slots reference content items without a cascade). */
export async function resetGenerationTables(ctx: TestContext): Promise<void> {
  await ctx.prisma.contentGenerationRun.deleteMany();
  await ctx.prisma.contentItemServing.deleteMany();
  await ctx.prisma.contentItem.deleteMany();
  await ctx.prisma.promptExecution.deleteMany();
  await ctx.prisma.credentialUsage.deleteMany();
  await ctx.prisma.userCredential.deleteMany();
  await ctx.prisma.user.deleteMany();
}

/** mulberry32: a seeded PRNG, so genre and topic draws are repeatable. */
export function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
