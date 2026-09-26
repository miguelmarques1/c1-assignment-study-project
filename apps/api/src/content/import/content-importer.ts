import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type { ImportableContentType } from '@english-quest/shared';
import type { PrismaClient } from '@prisma/client';

import type { LoadedErrorTaxonomy } from '../../taxonomy/error-taxonomy';
import { StorageUnavailableError } from '../../storage/storage.service';
import { contentMediaKey, IMPORTABLE_CONTENT_TYPES } from '../content-constants';
import { ContentItemRepository, ContentSlugConflictError, type StoredMedia } from '../content-item.repository';
import { formatIssue, parseMetaJson, validateCuratedMeta } from '../content-item.validation';
import { assertContentSchemaExists } from '../content-schema-guard';
import { describeFilter, scanContentRoot, type ContentFilter, type ScannedItem } from './folder-scanner';
import {
  countOutcomes,
  exitCodeFor,
  formatOrphans,
  formatOutcome,
  formatSummary,
  formatWarning,
  type ImportCounts,
  type ItemOutcome,
} from './import-report';
import { probeAudio, type ProbedAudio } from './media-probe';

/** The three storage calls the importer makes; `StorageService` satisfies it. */
export interface ContentStorage {
  uploadFile(key: string, filePath: string, contentType: string): Promise<void>;
  statObject(key: string): Promise<number | null>;
  deleteObject(key: string): Promise<void>;
}

export interface ImportOptions {
  root: string;
  filter?: ContentFilter | null;
  dryRun?: boolean;
  prisma: PrismaClient;
  storage: ContentStorage;
  taxonomy: LoadedErrorTaxonomy;
  /** Called with each output line as soon as it is known, so the CLI streams per item. */
  onLine?: (line: string) => void;
}

export interface ImportReport {
  outcomes: ItemOutcome[];
  warnings: string[];
  orphans: string[];
  counts: ImportCounts;
  dryRun: boolean;
  exitCode: 0 | 1;
  lines: string[];
}

/** The filter, or the whole content root, holds no item folder. */
export class NothingToImportError extends Error {
  override readonly name = 'NothingToImportError';
  constructor(filter: ContentFilter | null) {
    super(`Nothing to import at ${describeFilter(filter)}.`);
  }
}

/** First meaningful line of an error, from its cause when it wraps one (`StorageUnavailableError`). */
function describeError(error: unknown): string {
  const source = error instanceof StorageUnavailableError && error.cause ? error.cause : error;
  const message = source instanceof Error ? source.message || source.name : String(source);
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // Prisma leads with "Invalid `prisma.x()` invocation:" and puts the cause last.
  const line = lines.length > 1 && /invocation:?$/.test(lines[0]!) ? lines[lines.length - 1]! : (lines[0] ?? '');
  return line.length > 300 ? `${line.slice(0, 297)}...` : line;
}

interface ItemContext {
  dryRun: boolean;
  storage: ContentStorage;
  taxonomy: LoadedErrorTaxonomy;
  repository: ContentItemRepository;
  warn: (message: string) => void;
}

function skipped(item: ScannedItem, reason: string, details: string[] = []): ItemOutcome {
  return { status: 'skipped', label: item.label, reason, details };
}

function failed(item: ScannedItem, reason: string): ItemOutcome {
  return { status: 'failed', label: item.label, reason };
}

/** The folder's media against its type: exactly one audio file for listening, none otherwise. */
function mediaRule(type: ImportableContentType, audioFiles: string[]): string | null {
  const names = audioFiles.map((file) => basename(file));
  if (type !== 'listening') {
    return names.length > 0 ? `audio files are only allowed in listening folders (${names.join(', ')})` : null;
  }
  if (names.length === 0) {
    return 'audio file not found in folder';
  }
  return names.length > 1 ? `more than one audio file in folder (${names.join(', ')})` : null;
}

/**
 * One item, in the order the spec fixes: validate, probe, check the slug's
 * owner, upload when needed, write the row, then delete a replaced object.
 * Uploading before the row means an unreachable store leaves no row behind;
 * the reverse failure (uploaded, then the write failed) leaves an object the
 * next run overwrites, because the stored checksum still differs.
 */
async function importItem(item: ScannedItem, context: ItemContext): Promise<ItemOutcome> {
  const type = item.importableType;
  if (item.problem || !type || !item.metaPath) {
    return skipped(item, item.problem ?? 'meta.json not found in folder');
  }

  let text: string;
  try {
    text = await readFile(item.metaPath, 'utf-8');
  } catch (error) {
    return skipped(item, `meta.json could not be read: ${describeError(error)}`);
  }
  const parsed = parseMetaJson(text);
  const validated = parsed.ok ? validateCuratedMeta(type, parsed.value, context.taxonomy) : parsed;
  if (!validated.ok) {
    const [first, ...rest] = validated.issues.map(formatIssue);
    return skipped(item, `meta.json: ${first}`, rest);
  }

  const mediaProblem = mediaRule(type, item.audioFiles);
  if (mediaProblem) {
    return skipped(item, mediaProblem);
  }

  let probed: ProbedAudio | null = null;
  const audioPath = item.audioFiles[0];
  if (audioPath) {
    const probe = await probeAudio(audioPath).catch(
      (error: unknown) => ({ ok: false, reason: `audio file could not be read: ${describeError(error)}` }) as const,
    );
    if (!probe.ok) {
      return skipped(item, probe.reason);
    }
    probed = probe.audio;
  }

  const existing = await context.repository.findBySlug(item.slug);
  const conflict = context.repository.conflictWith(existing, type, 'curated');
  if (conflict) {
    return skipped(item, conflict.message);
  }

  let media: StoredMedia | null = null;
  let upload: 'new' | 'changed' | 'restored' | null = null;
  let replacedKey: string | null = null;
  if (probed && audioPath) {
    const key = contentMediaKey(type, item.slug, probed.fileName);
    media = { objectKey: key, checksum: probed.checksum, bytes: probed.bytes, durationSeconds: probed.durationSeconds };
    if (!existing?.mediaObjectKey) {
      upload = 'new';
    } else if (existing.mediaChecksum !== probed.checksum || existing.mediaObjectKey !== key) {
      upload = 'changed';
      replacedKey = existing.mediaObjectKey !== key ? existing.mediaObjectKey : null;
    } else {
      // The checksum says nothing changed, but a wiped volume would leave the
      // row pointing at nothing; `statObject` tells missing from unreachable.
      try {
        upload = (await context.storage.statObject(key)) === null ? 'restored' : null;
      } catch (error) {
        return failed(item, `storage unavailable: ${describeError(error)}`);
      }
    }

    if (upload && !context.dryRun) {
      try {
        await context.storage.uploadFile(key, audioPath, probed.contentType);
      } catch (error) {
        return failed(item, `upload failed: ${describeError(error)}`);
      }
    }
  }

  if (!context.dryRun) {
    try {
      await context.repository.upsertCurated({ type, slug: item.slug, meta: validated.value, media });
    } catch (error) {
      if (error instanceof ContentSlugConflictError) {
        return skipped(item, error.message);
      }
      return failed(item, `database write failed: ${describeError(error)}`);
    }

    if (replacedKey) {
      try {
        await context.storage.deleteObject(replacedKey);
      } catch (error) {
        context.warn(`${item.label}: the replaced object ${replacedKey} could not be deleted (${describeError(error)})`);
      }
    }
  }

  const uploadedBytes = upload ? (media?.bytes ?? null) : null;
  if (!existing) {
    return { status: 'imported', label: item.label, uploadedBytes };
  }
  const change = !media ? 'none' : upload === 'restored' ? 'restored' : upload ? 'reuploaded' : 'unchanged';
  return { status: 'updated', label: item.label, media: change, uploadedBytes };
}

/** Curated rows of the scanned types whose folder is gone. A single-item run never reports any. */
async function findOrphans(
  repository: ContentItemRepository,
  items: ScannedItem[],
  filter: ContentFilter | null,
): Promise<string[]> {
  if (filter?.slug) {
    return [];
  }
  const types = filter ? IMPORTABLE_CONTENT_TYPES.filter((type) => type === filter.type) : IMPORTABLE_CONTENT_TYPES;
  if (types.length === 0) {
    return [];
  }
  const onDisk = new Set(items.map((item) => `${item.typeFolder}/${item.slug}`));
  const rows = await repository.listCurated(types);
  return rows.filter((row) => !onDisk.has(`${row.type}/${row.slug}`)).map((row) => row.slug);
}

/**
 * `pnpm content:import`. Never throws for a per-item problem: each one
 * becomes a `skipped` or `failed` outcome and the batch carries on. Throws
 * only when nothing can run at all (schema not migrated, nothing to import).
 */
export async function runImport(options: ImportOptions): Promise<ImportReport> {
  const filter = options.filter ?? null;
  const dryRun = options.dryRun ?? false;
  const lines: string[] = [];
  const emit = (line: string): void => {
    lines.push(line);
    options.onLine?.(line);
  };

  await assertContentSchemaExists(options.prisma, 'content:import');

  const items = await scanContentRoot(options.root, filter);
  if (items.length === 0) {
    throw new NothingToImportError(filter);
  }

  const repository = new ContentItemRepository(options.prisma);
  const outcomes: ItemOutcome[] = [];
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    emit(formatWarning(message));
  };
  const context: ItemContext = { dryRun, storage: options.storage, taxonomy: options.taxonomy, repository, warn };

  for (const item of items) {
    let outcome: ItemOutcome;
    try {
      outcome = await importItem(item, context);
    } catch (error) {
      outcome = failed(item, `unexpected error: ${describeError(error)}`);
    }
    outcomes.push(outcome);
    emit(formatOutcome(outcome, dryRun));
  }

  let orphans: string[] = [];
  try {
    orphans = await findOrphans(repository, items, filter);
  } catch (error) {
    warn(`could not check the bank for items missing from disk (${describeError(error)})`);
  }
  const orphanLine = formatOrphans(orphans);
  if (orphanLine) {
    emit(orphanLine);
  }

  const counts = countOutcomes(outcomes);
  emit(formatSummary(counts, dryRun));

  return { outcomes, warnings, orphans, counts, dryRun, exitCode: exitCodeFor(counts), lines };
}
