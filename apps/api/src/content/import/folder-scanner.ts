import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { CONTENT_SLUG_MAX_LENGTH, CONTENT_SLUG_PATTERN, type ImportableContentType } from '@english-quest/shared';

import { AUDIO_CONTENT_TYPES, IMPORTABLE_CONTENT_TYPES, META_FILE } from '../content-constants';

/** `listening` or `listening/bbc-climate-debate`, from the CLI's positional argument. */
export interface ContentFilter {
  type: string;
  slug: string | null;
}

export interface ScannedItem {
  /** The type folder's name; `importableType` is set only when it names a real type. */
  typeFolder: string;
  importableType: ImportableContentType | null;
  slug: string;
  /** What the report calls the item: the slug, or `type/slug` under an unknown type folder. */
  label: string;
  folder: string;
  metaPath: string | null;
  /** Every file in the folder with an audio extension, in any case. */
  audioFiles: string[];
  /** Set when the item cannot be imported whatever its contents: unknown type, bad folder name, no meta.json. */
  problem: string | null;
}

export class InvalidContentFilterError extends Error {
  override readonly name = 'InvalidContentFilterError';
}

export function parseContentFilter(argument: string): ContentFilter {
  const parts = argument.replace(/\/+$/, '').split('/');
  if (parts.length > 2 || parts.some((part) => part.length === 0)) {
    throw new InvalidContentFilterError(`"${argument}" is not a filter: use <type> or <type>/<slug>.`);
  }
  return { type: parts[0]!, slug: parts[1] ?? null };
}

export function describeFilter(filter: ContentFilter | null): string {
  if (!filter) {
    return 'assignment-content';
  }
  return `assignment-content/${filter.type}${filter.slug ? `/${filter.slug}` : ''}`;
}

function isImportableType(name: string): name is ImportableContentType {
  return (IMPORTABLE_CONTENT_TYPES as readonly string[]).includes(name);
}

function isSlug(name: string): boolean {
  return name.length <= CONTENT_SLUG_MAX_LENGTH && CONTENT_SLUG_PATTERN.test(name);
}

async function directories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Finds every item folder at `<root>/<type>/<slug>/`. Files directly under the
 * root or a type folder (READMEs, `meta.schema.json`) are never items. An
 * item under an unknown type folder, or with a folder name that is not a
 * slug, is still returned, with its problem set, so a typo such as
 * `listenning/` is reported item by item instead of silently dropped.
 */
export async function scanContentRoot(root: string, filter: ContentFilter | null = null): Promise<ScannedItem[]> {
  const items: ScannedItem[] = [];

  for (const typeFolder of await directories(root)) {
    if (filter && filter.type !== typeFolder) {
      continue;
    }
    const importableType = isImportableType(typeFolder) ? typeFolder : null;

    for (const slug of await directories(join(root, typeFolder))) {
      if (filter?.slug && filter.slug !== slug) {
        continue;
      }
      const folder = join(root, typeFolder, slug);
      const files = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isFile());
      const hasMeta = files.some((entry) => entry.name === META_FILE);
      const audioFiles = files
        .filter((entry) => extname(entry.name).toLowerCase() in AUDIO_CONTENT_TYPES)
        .map((entry) => join(folder, entry.name))
        .sort();

      let problem: string | null = null;
      if (!importableType) {
        problem = `unknown content type folder "${typeFolder}"`;
      } else if (!isSlug(slug)) {
        problem = `folder name "${slug}" is not a valid slug (lowercase letters and digits separated by single hyphens, at most ${CONTENT_SLUG_MAX_LENGTH} characters)`;
      } else if (!hasMeta) {
        problem = 'meta.json not found in folder';
      }

      items.push({
        typeFolder,
        importableType,
        slug,
        label: importableType ? slug : `${typeFolder}/${slug}`,
        folder,
        metaPath: hasMeta ? join(folder, META_FILE) : null,
        audioFiles,
        problem,
      });
    }
  }

  return items;
}
