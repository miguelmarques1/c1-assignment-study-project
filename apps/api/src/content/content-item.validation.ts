import {
  curatedItemMetaSchemaFor,
  generatedItemInputSchema,
  type CuratedItemMeta,
  type GeneratedItemInput,
  type ImportableContentType,
} from '@english-quest/shared';
import type { z } from 'zod';

import type { LoadedErrorTaxonomy } from '../taxonomy/error-taxonomy';

/**
 * The one door every content item passes through, whichever way it enters
 * the bank: the importer's `meta.json` and F14's `saveGenerated` input. Each
 * runs its shared Zod schema, then has every target tag checked against the
 * taxonomy in force, which only the API can load. Issues come back as
 * `<json-pointer> <message>` lines, every one of them rather than the first.
 */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

type Path = ReadonlyArray<PropertyKey>;

/** RFC 6901, with the root written as `(root)` so a report line never starts with a bare space. */
export function toJsonPointer(path: Path): string {
  if (path.length === 0) {
    return '(root)';
  }
  return path.map((segment) => `/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

function valueAt(raw: unknown, path: Path): unknown {
  let current = raw;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

function formatIssues(issues: z.core.$ZodIssue[], raw: unknown): string[] {
  const lines: string[] = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        lines.push(`${toJsonPointer([...issue.path, key])} is not a recognized field`);
      }
      continue;
    }
    // Zod's "expected string, received undefined" is a missing field; say so.
    const missing =
      (issue.code === 'invalid_type' || issue.code === 'invalid_value') && valueAt(raw, issue.path) === undefined;
    lines.push(`${toJsonPointer(issue.path)} ${missing ? 'is required' : issue.message}`);
  }
  return lines;
}

/**
 * Checked on the raw input, so a tag outside the taxonomy is reported even
 * when some other field failed. Entries the schema already rejects for their
 * shape are left to the schema's own issue.
 */
function taxonomyIssues(raw: unknown, key: 'target_tags' | 'targetTags', taxonomy: LoadedErrorTaxonomy): string[] {
  const tags = valueAt(raw, [key]);
  if (!Array.isArray(tags)) {
    return [];
  }
  const inForce = new Set(taxonomy.tags.map((entry) => entry.tag));
  const lines: string[] = [];
  tags.forEach((tag: unknown, index) => {
    if (typeof tag !== 'string') {
      return;
    }
    const trimmed = tag.trim();
    if (trimmed.length === 0 || trimmed.length > 64 || inForce.has(trimmed)) {
      return;
    }
    lines.push(`${toJsonPointer([key, index])} "${trimmed}" is not in the error taxonomy (v${taxonomy.version})`);
  });
  return lines;
}

function validate<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  tagsKey: 'target_tags' | 'targetTags',
  taxonomy: LoadedErrorTaxonomy,
): ValidationResult<T> {
  const parsed = schema.safeParse(raw);
  const issues = [
    ...(parsed.success ? [] : formatIssues(parsed.error.issues, raw)),
    ...taxonomyIssues(raw, tagsKey, taxonomy),
  ];
  if (issues.length > 0 || !parsed.success) {
    return { ok: false, issues };
  }
  return { ok: true, value: parsed.data };
}

/** Editors on Windows may save `meta.json` with a leading BOM, which `JSON.parse` rejects. */
const BYTE_ORDER_MARK = 0xfeff;

/** `meta.json` text to a value, or the parser's own message. */
export function parseMetaJson(text: string): ValidationResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [`invalid JSON: ${message}`] };
  }
}

export function validateCuratedMeta(
  type: ImportableContentType,
  raw: unknown,
  taxonomy: LoadedErrorTaxonomy,
): ValidationResult<CuratedItemMeta> {
  return validate<CuratedItemMeta>(curatedItemMetaSchemaFor(type), raw, 'target_tags', taxonomy);
}

export function validateGeneratedInput(raw: unknown, taxonomy: LoadedErrorTaxonomy): ValidationResult<GeneratedItemInput> {
  return validate<GeneratedItemInput>(generatedItemInputSchema, raw, 'targetTags', taxonomy);
}
