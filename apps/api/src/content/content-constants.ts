import { resolve } from 'node:path';

import type { ImportableContentType } from '@english-quest/shared';

/**
 * The curator's workspace, resolved like F11's taxonomy path: the CLIs run
 * from `apps/api`, and inside the container the repository root is mounted
 * at `/workspace`, so the folder is visible without a volume of its own.
 * Tests pass their own root.
 */
export const CONTENT_ROOT = resolve(process.cwd(), '..', '..', 'assignment-content');

export const IMPORTABLE_CONTENT_TYPES: readonly ImportableContentType[] = ['listening', 'reading', 'vocabulary', 'grammar'];

/** The editor-facing schema generated beside each type folder's items (`pnpm content:schema`). */
export const META_SCHEMA_FILE = 'meta.schema.json';
export const META_FILE = 'meta.json';

/**
 * PRD rule, not configuration: a plan should not repeat what the same user
 * saw in the last 30 days. `findCandidates` can override it per query.
 */
export const RECENTLY_SERVED_WINDOW_DAYS = 30;

export const DEFAULT_CANDIDATE_LIMIT = 200;
export const MAX_CANDIDATE_LIMIT = 500;

/**
 * `StorageService.uploadFile` buffers the whole file (F07 kept it buffered on
 * purpose), so the cap bounds the importer's memory as much as the corpus.
 */
export const MAX_AUDIO_BYTES = 100_000_000;

/** The four extensions `.gitignore` keeps out of git, with the `Content-Type` F16 serves them under. */
export const AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

/** Object keys stay URL-safe. */
export const AUDIO_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export function contentMediaKey(type: string, slug: string, fileName: string): string {
  return `content/${type}/${slug}/${fileName}`;
}

/** The `Content-Type` for a stored key, from its extension; null when the key is absent or unknown. */
export function mediaContentTypeOf(key: string | null): string | null {
  if (!key) {
    return null;
  }
  const dot = key.lastIndexOf('.');
  return dot === -1 ? null : (AUDIO_CONTENT_TYPES[key.slice(dot).toLowerCase()] ?? null);
}
