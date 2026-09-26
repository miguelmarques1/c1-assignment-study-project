import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetEnvCache } from '../../src/config/env';
import { ContentItemRepository } from '../../src/content/content-item.repository';
import { validateGeneratedInput } from '../../src/content/content-item.validation';
import { ContentSchemaNotInitializedError } from '../../src/content/content-schema-guard';
import { runImport, type ContentStorage, type ImportReport } from '../../src/content/import/content-importer';
import { parseContentFilter } from '../../src/content/import/folder-scanner';
import { StorageService } from '../../src/storage/storage.service';
import {
  createContentRoot,
  fiveQuestions,
  fixtureTaxonomy,
  generatedInput,
  grammarMeta,
  listeningMeta,
  makeWav,
  multipleChoice,
  readingMeta,
  vocabularyMeta,
  type ContentRoot,
} from './helpers/content-fixtures';
import { startMinio, TEST_MINIO_ACCESS_KEY, TEST_MINIO_BUCKET, TEST_MINIO_SECRET_KEY, type StartedMinio } from './helpers/minio';
import { applyMigrations, TEST_MASTER_KEY, TEST_SESSION_SECRET } from './helpers/test-app';

const taxonomy = fixtureTaxonomy();

let postgres: StartedPostgreSqlContainer;
let minio: StartedMinio;
let prisma: PrismaClient;
let storage: StorageService;
let content: ContentRoot;

/** Records every write the importer makes to storage, then forwards it. Test-only. */
function spy(inner: ContentStorage) {
  const uploads: string[] = [];
  const deletes: string[] = [];
  const storageSpy: ContentStorage = {
    uploadFile: async (key, path, contentType) => {
      uploads.push(key);
      await inner.uploadFile(key, path, contentType);
    },
    statObject: (key) => inner.statObject(key),
    deleteObject: async (key) => {
      deletes.push(key);
      await inner.deleteObject(key);
    },
  };
  return { uploads, deletes, storage: storageSpy };
}

/** A real `StorageService` aimed at a port nothing listens on. */
function unreachableStorage(): StorageService {
  const original = process.env.S3_ENDPOINT;
  process.env.S3_ENDPOINT = 'http://127.0.0.1:1';
  resetEnvCache();
  const unreachable = new StorageService();
  process.env.S3_ENDPOINT = original;
  resetEnvCache();
  return unreachable;
}

function run(options: { storage?: ContentStorage; dryRun?: boolean; filter?: string } = {}): Promise<ImportReport> {
  return runImport({
    root: content.root,
    filter: options.filter ? parseContentFilter(options.filter) : null,
    dryRun: options.dryRun ?? false,
    prisma,
    storage: options.storage ?? storage,
    taxonomy,
  });
}

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = `${postgres.getConnectionUri()}?schema=public`;
  await applyMigrations(databaseUrl);
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  minio = await startMinio();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: TEST_SESSION_SECRET,
    BYOK_MASTER_KEY: TEST_MASTER_KEY,
    S3_ENDPOINT: minio.endpoint,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: TEST_MINIO_ACCESS_KEY,
    S3_SECRET_KEY: TEST_MINIO_SECRET_KEY,
    S3_BUCKET: TEST_MINIO_BUCKET,
    LIVEKIT_URL: 'http://localhost:7880',
    LIVEKIT_WS_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
  });
  resetEnvCache();
  storage = new StorageService();
  await storage.ensureBucket();
}, 240_000);

afterAll(async () => {
  storage?.destroy();
  await prisma?.$disconnect().catch(() => undefined);
  await minio?.stop().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
  resetEnvCache();
});

beforeEach(async () => {
  await prisma.contentItem.deleteMany();
  content = await createContentRoot();
});

afterEach(async () => {
  await content.cleanup();
});

describe('content:import', () => {
  it('imports_a_listening_item_from_media_and_valid_meta', async () => {
    const wav = makeWav(3);
    await content.writeItem('listening', 'bbc-climate-debate', listeningMeta(), { 'audio.wav': wav });

    const report = await run();

    expect(report.lines[0]).toBe('✓ bbc-climate-debate (imported, 48.0 KB uploaded)');
    expect(report.exitCode).toBe(0);
    const row = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'bbc-climate-debate' } });
    expect(row).toMatchObject({
      type: 'listening',
      provenance: 'curated',
      accent: 'british',
      durationSeconds: 3,
      mediaObjectKey: 'content/listening/bbc-climate-debate/audio.wav',
      mediaBytes: wav.length,
      sourceName: 'BBC Radio 4',
      wordCount: 12,
      promptId: null,
    });
    expect(row.mediaChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await storage.getObject('content/listening/bbc-climate-debate/audio.wav')).toEqual(wav);
    // Only the key is stored: nothing in the row is anywhere near the audio's size.
    expect(Object.values(row).some((value) => Buffer.isBuffer(value))).toBe(false);
    expect(JSON.stringify(row).length).toBeLessThan(wav.length / 4);
  });

  it('reimport_updates_in_place_without_duplicating', async () => {
    await content.writeItem('listening', 'ted-urban-design', listeningMeta(), { 'audio.wav': makeWav(2) });
    await run();
    const before = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'ted-urban-design' } });

    await content.writeItem('listening', 'ted-urban-design', listeningMeta({ title: 'Cities that walk' }));
    const report = await run();

    expect(report.lines[0]).toBe('↻ ted-urban-design (updated, media unchanged)');
    expect(await prisma.contentItem.count()).toBe(1);
    const after = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'ted-urban-design' } });
    expect(after.id).toBe(before.id);
    expect(after.title).toBe('Cities that walk');
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('reuploads_media_only_when_the_checksum_changes', async () => {
    await content.writeItem('listening', 'checksum-item', listeningMeta(), { 'audio.wav': makeWav(2) });
    await run();
    const first = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'checksum-item' } });

    const unchanged = spy(storage);
    const again = await run({ storage: unchanged.storage });
    expect(unchanged.uploads).toEqual([]);
    expect(again.lines[0]).toBe('↻ checksum-item (updated, media unchanged)');

    const changedBytes = makeWav(4);
    await content.writeItem('listening', 'checksum-item', listeningMeta(), { 'audio.wav': changedBytes });
    const changed = spy(storage);
    const report = await run({ storage: changed.storage });

    expect(changed.uploads).toEqual(['content/listening/checksum-item/audio.wav']);
    expect(report.lines[0]).toBe('↻ checksum-item (updated, 64.0 KB re-uploaded)');
    const after = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'checksum-item' } });
    expect(after.mediaChecksum).not.toBe(first.mediaChecksum);
    expect(after.durationSeconds).toBe(4);
    expect(await storage.getObject('content/listening/checksum-item/audio.wav')).toEqual(changedBytes);
  });

  it('restores_media_missing_from_storage', async () => {
    await content.writeItem('listening', 'wiped-item', listeningMeta(), { 'audio.wav': makeWav(1) });
    await run();
    await storage.deleteObject('content/listening/wiped-item/audio.wav');

    const report = await run();

    expect(report.lines[0]).toBe('↻ wiped-item (updated, 16.0 KB re-uploaded — object was missing)');
    expect(await storage.statObject('content/listening/wiped-item/audio.wav')).not.toBeNull();
  });

  it('renamed_audio_replaces_the_object_and_deletes_the_old_one', async () => {
    const folder = await content.writeItem('listening', 'renamed-item', listeningMeta(), { 'audio.wav': makeWav(1) });
    await run();

    await rm(join(folder, 'audio.wav'));
    await content.writeItem('listening', 'renamed-item', listeningMeta(), { 'take-2.wav': makeWav(1) });
    const report = await run();

    expect(report.lines[0]).toBe('↻ renamed-item (updated, 16.0 KB re-uploaded)');
    const row = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'renamed-item' } });
    expect(row.mediaObjectKey).toBe('content/listening/renamed-item/take-2.wav');
    expect(await storage.statObject('content/listening/renamed-item/take-2.wav')).not.toBeNull();
    expect(await storage.statObject('content/listening/renamed-item/audio.wav')).toBeNull();
  });

  it('invalid_meta_is_skipped_with_its_path_and_the_batch_continues', async () => {
    await content.writeItem('reading', 'good-one', readingMeta());
    await content.writeItem('reading', 'bad-one', readingMeta({ difficulty: 9, cefr_level: 'C3' }));
    await content.writeItem('reading', 'broken-json', '{ "title": ');
    await content.writeItem('reading', 'zz-good-two', readingMeta());

    const report = await run();

    expect(report.lines).toContain(
      '✗ bad-one (meta.json: /cefr_level Invalid option: expected one of "A1"|"A2"|"B1"|"B2"|"C1"|"C2")\n    /difficulty must be between 1 and 5',
    );
    expect(report.lines.find((line) => line.startsWith('✗ broken-json'))).toMatch(/^✗ broken-json \(meta\.json: invalid JSON: /);
    expect((await prisma.contentItem.findMany({ orderBy: { slug: 'asc' } })).map((row) => row.slug)).toEqual([
      'good-one',
      'zz-good-two',
    ]);
    expect(report.counts).toEqual({ imported: 2, updated: 0, skipped: 2, failed: 0 });
  });

  it('answer_not_among_options_is_rejected', async () => {
    const questions = fiveQuestions();
    questions[2] = multipleChoice({ answer: 'None of these' });
    await content.writeItem('reading', 'npr-housing', readingMeta({ questions }));

    const report = await run();

    expect(report.lines[0]).toBe('✗ npr-housing (meta.json: /questions/2/answer must be one of /questions/2/options)');
    expect(await prisma.contentItem.count()).toBe(0);
  });

  it('tag_outside_the_taxonomy_is_rejected', async () => {
    await content.writeItem('reading', 'bad-tag', readingMeta({ target_tags: ['grammar:conditional-3', 'vocab:foo'] }));

    const report = await run();

    expect(report.lines[0]).toBe('✗ bad-tag (meta.json: /target_tags/1 "vocab:foo" is not in the error taxonomy (vfixture-1))');
    expect(await prisma.contentItem.count()).toBe(0);
  });

  it('missing_audio_file_writes_no_row_and_uploads_nothing', async () => {
    await content.writeItem('listening', 'no-audio', listeningMeta(), { 'notes.txt': 'draft' });
    const watched = spy(storage);

    const report = await run({ storage: watched.storage });

    expect(report.lines[0]).toBe('✗ no-audio (audio file not found in folder)');
    expect(watched.uploads).toEqual([]);
    expect(await prisma.contentItem.count()).toBe(0);
  });

  it('slug_used_by_another_type_is_rejected', async () => {
    await content.writeItem('listening', 'shared-slug', listeningMeta(), { 'audio.wav': makeWav(1) });
    await run();
    const original = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'shared-slug' } });

    await content.removeItem('listening', 'shared-slug');
    await content.writeItem('reading', 'shared-slug', readingMeta());
    const report = await run({ filter: 'reading' });

    expect(report.lines[0]).toBe('✗ shared-slug (slug already used by a listening item)');
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'shared-slug' } })).toEqual(original);
  });

  it('slug_used_by_a_generated_item_is_rejected', async () => {
    const generated = validateGeneratedInput(generatedInput({ slug: 'gen-reading-1' }), taxonomy);
    if (!generated.ok) {
      throw new Error(generated.issues.join('; '));
    }
    await new ContentItemRepository(prisma).upsertGenerated(generated.value);
    await content.writeItem('reading', 'gen-reading-1', readingMeta());

    const report = await run();

    expect(report.lines[0]).toBe('✗ gen-reading-1 (slug already used by a generated item)');
    const row = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'gen-reading-1' } });
    expect(row.provenance).toBe('generated');
  });

  it('storage_unreachable_fails_the_item_before_any_row', async () => {
    await content.writeItem('listening', 'offline-listening', listeningMeta(), { 'audio.wav': makeWav(1) });
    await content.writeItem('reading', 'offline-reading', readingMeta());
    const unreachable = unreachableStorage();

    try {
      const report = await run({ storage: unreachable });

      expect(report.lines[0]).toMatch(/^✗ offline-listening \(upload failed: .+\)$/);
      expect(report.lines[1]).toBe('✓ offline-reading (imported)');
      expect(await prisma.contentItem.findUnique({ where: { slug: 'offline-listening' } })).toBeNull();
      expect(await prisma.contentItem.findUnique({ where: { slug: 'offline-reading' } })).not.toBeNull();

      // An existing item whose media is unchanged still needs the store, to
      // prove its object exists: the item fails and its row is left alone.
      await run();
      const before = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'offline-listening' } });
      const again = await run({ storage: unreachable, filter: 'listening' });
      expect(again.lines[0]).toMatch(/^✗ offline-listening \(storage unavailable: .+\)$/);
      expect(await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'offline-listening' } })).toEqual(before);
    } finally {
      unreachable.destroy();
    }
  });

  it('any_skip_or_failure_exits_nonzero_with_all_four_counts', async () => {
    await content.writeItem('listening', 'will-fail', listeningMeta(), { 'audio.wav': makeWav(1) });
    await content.writeItem('reading', 'will-import', readingMeta());
    await content.writeItem('reading', 'will-skip', readingMeta({ difficulty: 0 }));
    const unreachable = unreachableStorage();

    try {
      const report = await run({ storage: unreachable });
      expect(report.exitCode).toBe(1);
      expect(report.lines[report.lines.length - 1]).toBe('1 imported, 0 updated, 1 skipped, 1 failed.');
    } finally {
      unreachable.destroy();
    }

    await content.removeItem('listening', 'will-fail');
    await content.removeItem('reading', 'will-skip');
    const clean = await run();
    expect(clean.exitCode).toBe(0);
    expect(clean.lines[clean.lines.length - 1]).toBe('0 imported, 1 updated, 0 skipped, 0 failed.');
  });

  it('imports_curated_reading_vocabulary_and_grammar_without_media', async () => {
    await content.writeItem('reading', 'op-ed', readingMeta());
    await content.writeItem('vocabulary', 'cost-collocations', vocabularyMeta());
    await content.writeItem('grammar', 'third-conditional', grammarMeta());

    const report = await run();

    expect(report.counts).toEqual({ imported: 3, updated: 0, skipped: 0, failed: 0 });
    const rows = await prisma.contentItem.findMany({ orderBy: { slug: 'asc' } });
    expect(rows.map((row) => [row.slug, row.type, row.wordCount, row.mediaObjectKey, row.durationSeconds])).toEqual([
      ['cost-collocations', 'vocabulary', null, null, null],
      ['op-ed', 'reading', 15, null, null],
      ['third-conditional', 'grammar', null, null, null],
    ]);
  });

  it('rejects_audio_in_a_non_listening_folder', async () => {
    await content.writeItem('reading', 'reading-with-audio', readingMeta(), { 'audio.mp3': makeWav(1) });

    const report = await run();

    expect(report.lines[0]).toBe('✗ reading-with-audio (audio files are only allowed in listening folders (audio.mp3))');
    expect(await prisma.contentItem.count()).toBe(0);
  });

  it('dry_run_writes_nothing_and_reports_the_same_outcomes', async () => {
    await content.writeItem('reading', 'existing-reading', readingMeta());
    await run();
    const before = await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'existing-reading' } });

    await content.writeItem('reading', 'existing-reading', readingMeta({ title: 'Edited title' }));
    await content.writeItem('listening', 'new-listening', listeningMeta(), { 'audio.wav': makeWav(1) });
    await content.writeItem('reading', 'invalid-reading', readingMeta({ difficulty: 6 }));
    const watched = spy(storage);

    const report = await run({ dryRun: true, storage: watched.storage });

    expect(report.lines).toEqual([
      '✓ new-listening (would import, 16.0 KB to upload)',
      '↻ existing-reading (would update)',
      '✗ invalid-reading (meta.json: /difficulty must be between 1 and 5)',
      'Dry run — nothing was written. 1 imported, 1 updated, 1 skipped, 0 failed.',
    ]);
    expect(report.exitCode).toBe(1);
    expect(watched.uploads).toEqual([]);
    expect(await prisma.contentItem.count()).toBe(1);
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { slug: 'existing-reading' } })).toEqual(before);
    expect(await storage.statObject('content/listening/new-listening/audio.wav')).toBeNull();
  });

  it('folders_missing_from_disk_are_reported_and_left_untouched', async () => {
    await content.writeItem('reading', 'old-interview', readingMeta());
    await content.writeItem('reading', 'still-here', readingMeta());
    await run();

    await content.removeItem('reading', 'old-interview');
    const report = await run();

    expect(report.lines).toContain('! 1 curated item has no folder on disk and was left untouched: old-interview');
    expect(report.orphans).toEqual(['old-interview']);
    expect(report.exitCode).toBe(0);
    expect(await prisma.contentItem.findUnique({ where: { slug: 'old-interview' } })).not.toBeNull();

    // A run filtered to one item never reports the rest of the bank.
    expect((await run({ filter: 'reading/still-here' })).orphans).toEqual([]);
  });

  it('refuses_to_run_before_migrations', async () => {
    await prisma.$executeRawUnsafe('CREATE DATABASE content_fresh');
    const freshUrl = `${postgres.getConnectionUri().replace(/\/[^/]+$/, '/content_fresh')}?schema=public`;
    const fresh = new PrismaClient({ datasources: { db: { url: freshUrl } } });
    await content.writeItem('reading', 'anything', readingMeta());

    try {
      const attempt = runImport({ root: content.root, prisma: fresh, storage, taxonomy });
      await expect(attempt).rejects.toBeInstanceOf(ContentSchemaNotInitializedError);
      await expect(attempt).rejects.toThrow(
        'Database schema not initialized. Start the API once to run migrations, then re-run content:import.',
      );
    } finally {
      await fresh.$disconnect();
    }
  });

  it('reports_nothing_to_import_for_a_filter_that_matches_no_folder', async () => {
    await content.writeItem('reading', 'present', readingMeta());
    await expect(run({ filter: 'listening/absent' })).rejects.toThrow(
      'Nothing to import at assignment-content/listening/absent.',
    );
  });
});
