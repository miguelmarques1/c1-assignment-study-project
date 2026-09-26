import { randomUUID } from 'node:crypto';

import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ContentItem } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ContentBankService } from '../../src/content/content-bank.service';
import { ContentModule } from '../../src/content/content.module';
import { ContentItemRepository } from '../../src/content/content-item.repository';
import { validateCuratedMeta } from '../../src/content/content-item.validation';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { ErrorTaxonomyService } from '../../src/taxonomy/error-taxonomy.service';
import {
  FIXTURE_TAGS,
  fiveQuestions,
  generatedInput,
  grammarMeta,
  listeningMeta,
  multipleChoice,
  readingMeta,
} from './helpers/content-fixtures';
import { createTestContext, type TestContext } from './helpers/test-app';

const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: TestContext;
let service: ContentBankService;
let userA: string;
let userB: string;

async function createUser(email: string): Promise<string> {
  const user = await ctx.prisma.user.create({
    data: { email, displayName: email.split('@')[0]!, passwordHash: 'x'.repeat(60) },
  });
  return user.id;
}

/** A curated row through the same validation and repository the importer uses. */
async function curated(
  type: 'listening' | 'reading' | 'grammar',
  slug: string,
  meta: Record<string, unknown>,
): Promise<ContentItem> {
  const validated = validateCuratedMeta(type, meta, ctx.app.get(ErrorTaxonomyService).current());
  if (!validated.ok) {
    throw new Error(validated.issues.map((issue) => `${issue.path} ${issue.message}`).join('; '));
  }
  const media =
    type === 'listening'
      ? { objectKey: `content/listening/${slug}/audio.mp3`, checksum: 'a'.repeat(64), bytes: 1234, durationSeconds: 312 }
      : null;
  await new ContentItemRepository(ctx.prisma).upsertCurated({ type, slug, meta: validated.value, media });
  return ctx.prisma.contentItem.findUniqueOrThrow({ where: { slug } });
}

async function servedAgo(userId: string, itemId: string, days: number): Promise<void> {
  await ctx.prisma.contentItemServing.create({
    data: { userId, contentItemId: itemId, servedAt: new Date(Date.now() - days * DAY_MS) },
  });
}

beforeAll(async () => {
  ctx = await createTestContext();
  service = ctx.app.get(ContentBankService);
}, 240_000);

afterAll(async () => {
  await ctx?.close();
});

beforeEach(async () => {
  await ctx.prisma.contentItemServing.deleteMany();
  await ctx.prisma.contentItem.deleteMany();
  await ctx.prisma.user.deleteMany();
  userA = await createUser('a@example.com');
  userB = await createUser('b@example.com');
});

describe('ContentBankService', () => {
  it('filters_candidates_by_type_level_skills_tags_and_provenance', async () => {
    await curated('listening', 'c1-listening', listeningMeta());
    await curated('reading', 'b2-reading', readingMeta({ cefr_level: 'B2' }));
    await service.saveGenerated(generatedInput({ slug: 'gen-c1-reading' }));
    await service.saveGenerated(
      generatedInput({ slug: 'gen-c1-grammar', type: 'grammar', skills: ['grammar'], targetTags: [FIXTURE_TAGS.discourse] }),
    );

    const slugs = async (query: Partial<Parameters<ContentBankService['findCandidates']>[0]>) =>
      (await service.findCandidates({ userId: userA, ...query })).map((item) => item.slug).sort();

    expect(await slugs({})).toEqual(['b2-reading', 'c1-listening', 'gen-c1-grammar', 'gen-c1-reading']);
    expect(await slugs({ types: ['reading'] })).toEqual(['b2-reading', 'gen-c1-reading']);
    expect(await slugs({ cefrLevels: ['C1'], types: ['reading', 'listening'] })).toEqual(['c1-listening', 'gen-c1-reading']);
    expect(await slugs({ skills: ['vocabulary', 'grammar'] })).toEqual(['b2-reading', 'c1-listening', 'gen-c1-grammar', 'gen-c1-reading']);
    expect(await slugs({ skills: ['listening'] })).toEqual(['c1-listening']);
    expect(await slugs({ targetTags: [FIXTURE_TAGS.grammar] })).toEqual(['b2-reading', 'gen-c1-reading']);
    expect(await slugs({ targetTags: [FIXTURE_TAGS.vocab, FIXTURE_TAGS.discourse] })).toEqual(['c1-listening', 'gen-c1-grammar']);
    expect(await slugs({ provenance: 'generated' })).toEqual(['gen-c1-grammar', 'gen-c1-reading']);
    expect(await slugs({ provenance: 'curated', types: [] })).toEqual(['b2-reading', 'c1-listening']);
    expect(await service.findCandidates({ userId: userA, limit: 1 })).toHaveLength(1);
    await expect(service.findCandidates({ userId: userA, limit: 501 })).rejects.toMatchObject({ code: 'VAL001' });
  });

  it('candidates_carry_metadata_only', async () => {
    await curated('listening', 'meta-only', listeningMeta());

    const [candidate] = await service.findCandidates({ userId: userA });

    expect(Object.keys(candidate!).sort()).toEqual(
      [
        'accent',
        'cefrLevel',
        'difficulty',
        'durationSeconds',
        'id',
        'provenance',
        'skills',
        'slug',
        'targetTags',
        'title',
        'topic',
        'type',
        'wordCount',
      ].sort(),
    );
    expect(candidate).toMatchObject({ accent: 'british', durationSeconds: 312, wordCount: 12, difficulty: 4 });
    for (const forbidden of ['body', 'questions', 'sourceName', 'sourceUrl', 'mediaObjectKey', 'mediaChecksum']) {
      expect(candidate).not.toHaveProperty(forbidden);
    }
  });

  it('excludes_items_served_to_the_user_within_30_days', async () => {
    const recent = await curated('reading', 'served-recently', readingMeta());
    await curated('reading', 'never-served', readingMeta());
    await servedAgo(userA, recent.id, 29);

    const slugs = (await service.findCandidates({ userId: userA })).map((item) => item.slug);

    expect(slugs).toEqual(['never-served']);
  });

  it('includes_items_served_more_than_30_days_ago', async () => {
    const old = await curated('reading', 'served-long-ago', readingMeta());
    await servedAgo(userA, old.id, 31);

    const slugs = (await service.findCandidates({ userId: userA })).map((item) => item.slug);

    expect(slugs).toEqual(['served-long-ago']);
  });

  it('serving_to_another_user_does_not_exclude', async () => {
    const item = await curated('reading', 'served-to-a', readingMeta());
    await service.recordServed(userA, [item.id]);

    expect((await service.findCandidates({ userId: userA })).map((row) => row.slug)).toEqual([]);
    expect((await service.findCandidates({ userId: userB })).map((row) => row.slug)).toEqual(['served-to-a']);
  });

  it('exclusion_can_be_disabled_per_query', async () => {
    const item = await curated('reading', 'served-today', readingMeta());
    await service.recordServed(userA, [item.id]);

    const slugs = (await service.findCandidates({ userId: userA, excludeServedWithinDays: 0 })).map((row) => row.slug);

    expect(slugs).toEqual(['served-today']);
  });

  it('record_served_joins_a_caller_transaction', async () => {
    const item = await curated('reading', 'tx-item', readingMeta());

    await expect(
      ctx.prisma.$transaction(async (tx) => {
        await service.recordServed(userA, [item.id], tx);
        throw new Error('plan activation failed');
      }),
    ).rejects.toThrow('plan activation failed');
    expect(await ctx.prisma.contentItemServing.count()).toBe(0);

    await ctx.prisma.$transaction(async (tx) => {
      await service.recordServed(userA, [item.id, item.id], tx);
    });
    expect(await ctx.prisma.contentItemServing.count()).toBe(1);
  });

  it('get_payload_returns_questions_answers_explanations_and_media_key', async () => {
    const listening = await curated('listening', 'payload-listening', listeningMeta());
    const reading = await curated('reading', 'payload-reading', readingMeta());

    const payload = await service.getPayload(listening.id);

    expect(payload).toMatchObject({
      id: listening.id,
      slug: 'payload-listening',
      type: 'listening',
      provenance: 'curated',
      mediaObjectKey: 'content/listening/payload-listening/audio.mp3',
      mediaContentType: 'audio/mpeg',
      sourceName: 'BBC Radio 4',
      promptId: null,
      promptVersion: null,
    });
    expect(payload.body).toMatch(/^Presenter:/);
    expect(payload.questions).toHaveLength(5);
    for (const question of payload.questions) {
      expect(question.answer).toBeDefined();
      expect(question.explanation.length).toBeGreaterThan(0);
    }
    expect(payload.questions).toEqual(fiveQuestions());

    const readingPayload = await service.getPayload(reading.id);
    expect(readingPayload).toMatchObject({ mediaObjectKey: null, mediaContentType: null, accent: null });
  });

  it('get_payload_raises_content001_for_an_unknown_id', async () => {
    await expect(service.getPayload(randomUUID())).rejects.toMatchObject({ code: 'CONTENT001', status: 404 });
    await expect(service.getPayload('not-a-uuid')).rejects.toMatchObject({ code: 'CONTENT001' });
  });

  it('save_generated_persists_with_provenance_generated_and_prompt_stamp', async () => {
    const result = await service.saveGenerated(generatedInput({ slug: 'gen-reading-7c1e2a' }));

    expect(result).toMatchObject({ slug: 'gen-reading-7c1e2a', action: 'created' });
    const row = await ctx.prisma.contentItem.findUniqueOrThrow({ where: { id: result.id } });
    expect(row).toMatchObject({
      provenance: 'generated',
      type: 'reading',
      targetTags: [FIXTURE_TAGS.grammar],
      promptId: 'reading-generate',
      promptVersion: '3',
      gateMetrics: { word_count: 612, mean_sentence_length: 21.4 },
      wordCount: 15,
      sourceName: null,
      mediaObjectKey: null,
    });

    // Cross-feature (F14 → F15): the generated item is a candidate like any other.
    const candidates = await service.findCandidates({ userId: userA, provenance: 'generated' });
    expect(candidates).toEqual([expect.objectContaining({ id: result.id, provenance: 'generated' })]);
  });

  it('save_generated_is_idempotent_by_slug', async () => {
    const first = await service.saveGenerated(generatedInput({ slug: 'gen-idempotent' }));
    const second = await service.saveGenerated(generatedInput({ slug: 'gen-idempotent', title: 'Revised title' }));

    expect(second).toEqual({ id: first.id, slug: 'gen-idempotent', action: 'updated' });
    expect(await ctx.prisma.contentItem.count()).toBe(1);
    expect((await ctx.prisma.contentItem.findUniqueOrThrow({ where: { id: first.id } })).title).toBe('Revised title');
  });

  it('save_generated_refuses_a_curated_or_other_type_slug', async () => {
    const curatedRow = await curated('reading', 'curated-slug', readingMeta());
    await expect(service.saveGenerated(generatedInput({ slug: 'curated-slug' }))).rejects.toMatchObject({
      code: 'CONTENT002',
      status: 409,
      details: { slug: 'curated-slug', existingType: 'reading', existingProvenance: 'curated' },
    });
    expect(await ctx.prisma.contentItem.findUniqueOrThrow({ where: { slug: 'curated-slug' } })).toEqual(curatedRow);

    await service.saveGenerated(generatedInput({ slug: 'gen-typed' }));
    const before = await ctx.prisma.contentItem.findUniqueOrThrow({ where: { slug: 'gen-typed' } });
    await expect(
      service.saveGenerated(generatedInput({ slug: 'gen-typed', type: 'grammar', skills: ['grammar'] })),
    ).rejects.toMatchObject({ code: 'CONTENT002', details: { existingType: 'reading', existingProvenance: 'generated' } });
    expect(await ctx.prisma.contentItem.findUniqueOrThrow({ where: { slug: 'gen-typed' } })).toEqual(before);
  });

  it('save_generated_rejects_invalid_input_with_val001', async () => {
    const questions = fiveQuestions();
    questions[1] = multipleChoice({ answer: 'Not an option' });

    await expect(service.saveGenerated(generatedInput({ difficulty: 9, questions }))).rejects.toMatchObject({
      code: 'VAL001',
      details: [
        { path: '/difficulty', message: 'must be between 1 and 5' },
        { path: '/questions/1/answer', message: 'must be one of /questions/1/options' },
      ],
    });
    await expect(service.saveGenerated(generatedInput({ targetTags: ['remote-work'] }))).rejects.toMatchObject({
      code: 'VAL001',
      details: [{ path: '/targetTags/0', message: '"remote-work" is not in the error taxonomy (v1)' }],
    });
    await expect(service.saveGenerated(generatedInput({ type: 'listening' }))).rejects.toMatchObject({ code: 'VAL001' });
    expect(await ctx.prisma.contentItem.count()).toBe(0);
  });

  it('existing_ids_returns_only_ids_that_exist', async () => {
    const one = await curated('reading', 'exists-one', readingMeta());
    const { id: two } = await service.saveGenerated(generatedInput({ slug: 'exists-two' }));
    const invented = randomUUID();

    const existing = await service.existingIds([one.id, two, invented, 'not-a-uuid', one.id]);

    expect(existing).toEqual(new Set([one.id, two]));
    expect(await service.existingIds([])).toEqual(new Set());
  });

  it('database_rejects_inconsistent_direct_inserts', async () => {
    const questions = JSON.stringify(fiveQuestions());
    const insert = (columns: string, values: string) =>
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO content_item (slug, type, provenance, cefr_level, title, topic, skills, difficulty, questions, target_tags, ${columns})
         VALUES ($1, $2, $3, 'C1', 't', 'x', $4::text[], 4, $5::jsonb, ARRAY['grammar:conditional-3'], ${values})`,
        ...insertArgs,
      );
    let insertArgs: unknown[] = [];

    insertArgs = ['listening-no-media', 'listening', 'curated', ['listening'], questions];
    await expect(insert('accent, body, source_name', "'british', 'b', 's'")).rejects.toThrow(/content_item_listening_ck/);

    insertArgs = ['generated-no-prompt', 'reading', 'generated', ['reading'], questions];
    await expect(insert('body, gate_metrics', `'b', '{"a":1}'::jsonb`)).rejects.toThrow(/content_item_provenance_fields_ck/);

    insertArgs = ['bad-key', 'listening', 'curated', ['listening'], questions];
    await expect(
      insert(
        'accent, body, source_name, duration_seconds, media_object_key, media_checksum, media_bytes',
        `'british', 'b', 's', 10, 'content/listening/other-slug/audio.mp3', '${'a'.repeat(64)}', 10`,
      ),
    ).rejects.toThrow(/content_item_media_key_ck/);

    insertArgs = ['four-questions', 'reading', 'curated', ['reading'], JSON.stringify(fiveQuestions().slice(0, 4))];
    await expect(insert('body, source_name', "'b', 's'")).rejects.toThrow(/content_item_questions_ck/);

    // The same shape with every rule satisfied is accepted, so the rejections above are the rules, not the SQL.
    insertArgs = ['good-key', 'listening', 'curated', ['listening'], questions];
    await insert(
      'accent, body, source_name, duration_seconds, media_object_key, media_checksum, media_bytes',
      `'british', 'b', 's', 10, 'content/listening/good-key/audio.mp3', '${'a'.repeat(64)}', 10`,
    );
    expect(await ctx.prisma.contentItem.count()).toBe(1);
  });

  it('content_bank_service_is_injectable_from_any_module', async () => {
    @Injectable()
    class PlanComposerStandIn {
      constructor(readonly contentBank: ContentBankService) {}
    }

    // A module that never imports ContentModule, as F14/F15/F16's modules won't.
    @Module({ providers: [PlanComposerStandIn] })
    class ConsumerModule {}

    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, ContentModule, ConsumerModule] }).compile();
    try {
      expect(moduleRef.get(PlanComposerStandIn).contentBank).toBeInstanceOf(ContentBankService);
    } finally {
      await moduleRef.close();
    }

    expect(ctx.app.get(ContentBankService)).toBe(service);
    await curated('grammar', 'reachable', grammarMeta());
    expect(await service.findCandidates({ userId: userA })).toHaveLength(1);
  });
});
