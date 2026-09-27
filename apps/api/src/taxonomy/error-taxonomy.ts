import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * How a family spells its tags (F12). `slug` is `family:kebab-slug`, e.g.
 * `grammar:conditional-3`; `ipa` is `family:/symbol/`, e.g. `phoneme:/θ/`
 * as F10 writes it, with 1–4 non-space, non-slash characters between the
 * slashes. The ledger tables' CHECK accepts exactly these two shapes.
 */
const TAG_FORMATS = ['slug', 'ipa'] as const;
export type TaxonomyTagFormat = (typeof TAG_FORMATS)[number];

const TAG_PATTERNS: Record<TaxonomyTagFormat, { pattern: RegExp; description: string }> = {
  slug: { pattern: /^[a-z]+:[a-z0-9-]+$/, description: 'family:kebab-slug (lowercase)' },
  ipa: { pattern: /^[a-z]+:\/[^/\s]{1,4}\/$/u, description: 'family:/symbol/ (1–4 characters, no spaces or slashes)' },
};

const familyFileSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+$/, 'must be lowercase letters only'),
  label: z.string().min(1),
  /** Whether the lesson-analysis prompt's error schema includes this family's tags in its `enum` (F11). */
  analysis: z.boolean(),
  /** How the family's tags are spelled (F12). Omitted means `slug`. */
  format: z.enum(TAG_FORMATS).optional(),
});

const tagFileSchema = z.strictObject({
  tag: z.string(),
  label: z.string().min(1),
  family: z.string(),
  description: z.string().min(1),
});

/** The taxonomy file as written: snake_case-free, since every key here is already a single word. */
const taxonomyFileSchema = z
  .strictObject({
    version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/, 'must be 1–32 letters, digits, dots, dashes or underscores'),
    families: z.array(familyFileSchema).min(1),
    tags: z.array(tagFileSchema).min(1),
  })
  .superRefine((file, ctx) => {
    const familyFormats = new Map<string, TaxonomyTagFormat>();
    file.families.forEach((family, index) => {
      if (familyFormats.has(family.id)) {
        ctx.addIssue({ code: 'custom', path: ['families', index, 'id'], message: `"${family.id}" is listed twice` });
      }
      familyFormats.set(family.id, family.format ?? 'slug');
    });

    const seenTags = new Set<string>();
    file.tags.forEach((tag, index) => {
      // A tag of an undeclared family is reported below; its spelling is checked as a slug.
      const format = TAG_PATTERNS[familyFormats.get(tag.family) ?? 'slug'];
      if (!format.pattern.test(tag.tag)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tags', index, 'tag'],
          message: `"${tag.tag}" must match ${format.description}`,
        });
      }
      const [prefix] = tag.tag.split(':');
      if (prefix !== tag.family) {
        ctx.addIssue({
          code: 'custom',
          path: ['tags', index, 'family'],
          message: `"${tag.tag}" does not start with its declared family "${tag.family}"`,
        });
      }
      if (!familyFormats.has(tag.family)) {
        ctx.addIssue({
          code: 'custom',
          path: ['tags', index, 'family'],
          message: `"${tag.family}" is not a declared family`,
        });
      }
      if (seenTags.has(tag.tag)) {
        ctx.addIssue({ code: 'custom', path: ['tags', index, 'tag'], message: `"${tag.tag}" is listed twice` });
      }
      seenTags.add(tag.tag);
    });
  });

export interface TaxonomyFamily {
  id: string;
  label: string;
  analysis: boolean;
  format: TaxonomyTagFormat;
}

export interface TaxonomyTag {
  tag: string;
  label: string;
  family: string;
  description: string;
}

export interface ErrorTaxonomy {
  version: string;
  families: TaxonomyFamily[];
  /** Sorted by tag, so two files listing the same taxonomy differently are the same taxonomy. */
  tags: TaxonomyTag[];
}

export interface LoadedErrorTaxonomy extends ErrorTaxonomy {
  fingerprint: string;
  /** Tags belonging to a family with `analysis: true` — the ones the lesson-analysis prompt's `enum` must mirror exactly (F11). */
  analysisTags: string[];
  /** Each tag's family, for O(1) membership and family lookups per ingested occurrence (F12). */
  familyOf: ReadonlyMap<string, string>;
}

/** Thrown at boot when the taxonomy file is missing, unparsable or invalid. */
export class ErrorTaxonomyValidationError extends Error {
  override readonly name = 'ErrorTaxonomyValidationError';
  constructor(readonly issues: string[]) {
    super(`Invalid error taxonomy:\n  ${issues.join('\n  ')}`);
  }
}

/**
 * sha256 over every family and tag, in a fixed key order, with the version
 * left out: two versions with identical content share a fingerprint, and a
 * tag or label changed under the same version does not.
 */
export function taxonomyFingerprint(taxonomy: ErrorTaxonomy): string {
  const canonical = JSON.stringify({
    // `format` joins the tuple only when it isn't the default, so v1's pinned
    // fingerprint (written before formats existed) still describes v1.
    families: [...taxonomy.families]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((family) =>
        family.format === 'slug'
          ? [family.id, family.label, family.analysis]
          : [family.id, family.label, family.analysis, family.format],
      ),
    tags: [...taxonomy.tags]
      .sort((a, b) => a.tag.localeCompare(b.tag))
      .map((tag) => [tag.tag, tag.label, tag.family, tag.description]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Validates a parsed taxonomy file. Never throws: every problem comes back in `issues`. */
export function parseErrorTaxonomy(raw: unknown): { taxonomy: ErrorTaxonomy | null; issues: string[] } {
  const parsed = taxonomyFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      taxonomy: null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const { version, families, tags } = parsed.data;
  return {
    taxonomy: {
      version,
      families: families
        .map((family) => ({ ...family, format: family.format ?? 'slug' }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      tags: [...tags].sort((a, b) => a.tag.localeCompare(b.tag)),
    },
    issues: [],
  };
}

/** Reads, parses and validates the taxonomy file; throws with every issue at once. */
export function loadErrorTaxonomyFile(filePath: string): LoadedErrorTaxonomy {
  const label = basename(filePath);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ErrorTaxonomyValidationError([`${label}: could not be read or parsed — ${message}`]);
  }

  const { taxonomy, issues } = parseErrorTaxonomy(raw);
  if (!taxonomy) {
    throw new ErrorTaxonomyValidationError(issues.map((issue) => `${label}: ${issue}`));
  }

  const analysisFamilies = new Set(taxonomy.families.filter((family) => family.analysis).map((family) => family.id));
  const analysisTags = taxonomy.tags.filter((tag) => analysisFamilies.has(tag.family)).map((tag) => tag.tag);

  const familyOf = new Map(taxonomy.tags.map((tag) => [tag.tag, tag.family]));

  return { ...taxonomy, fingerprint: taxonomyFingerprint(taxonomy), analysisTags, familyOf };
}
