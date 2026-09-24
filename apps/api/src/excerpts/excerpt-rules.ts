import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { MAX_SELECTED_AUDIO_MS } from './excerpt-selection.constants';
import { normalizeToken } from './excerpt-tokens';

const share = z.number().min(0).max(1);
const positiveInt = z.number().int().positive();

/** The rules file as written: snake_case keys, like the prompt files. */
const rulesFileSchema = z
  .object({
    version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/, 'must be 1–32 letters, digits, dots, dashes or underscores'),
    eligibility: z.strictObject({
      min_duration_ms: positiveInt,
      max_duration_ms: positiveInt,
      min_words: positiveInt,
      max_filler_share: share,
      min_confidence: share,
      max_low_confidence_word_share: share,
    }),
    selection: z.strictObject({
      max_excerpts: positiveInt,
      spacing_window_ms: positiveInt,
      max_per_window: positiveInt,
      sparse_below: z.number().int().nonnegative(),
    }),
    fillers: z.array(z.string()).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const { eligibility, selection, fillers } = file;
    if (eligibility.min_duration_ms >= eligibility.max_duration_ms) {
      ctx.addIssue({
        code: 'custom',
        path: ['eligibility', 'min_duration_ms'],
        message: 'must be below max_duration_ms',
      });
    }
    if (selection.max_excerpts * eligibility.max_duration_ms > MAX_SELECTED_AUDIO_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['selection', 'max_excerpts'],
        message: `max_excerpts × max_duration_ms may not exceed ${MAX_SELECTED_AUDIO_MS} ms (6 minutes of assessed audio)`,
      });
    }
    const seen = new Set<string>();
    fillers.forEach((filler, index) => {
      if (filler.length === 0 || normalizeToken(filler) !== filler) {
        ctx.addIssue({
          code: 'custom',
          path: ['fillers', index],
          message: `"${filler}" is not a normalized token (lowercase, no surrounding punctuation)`,
        });
      }
      if (seen.has(filler)) {
        ctx.addIssue({ code: 'custom', path: ['fillers', index], message: `"${filler}" is listed twice` });
      }
      seen.add(filler);
    });
  });

export interface ExcerptRules {
  version: string;
  eligibility: {
    minDurationMs: number;
    maxDurationMs: number;
    minWords: number;
    maxFillerShare: number;
    minConfidence: number;
    maxLowConfidenceWordShare: number;
  };
  selection: {
    maxExcerpts: number;
    spacingWindowMs: number;
    maxPerWindow: number;
    sparseBelow: number;
  };
  /** Sorted, so two files that list the same lexicon differently are the same rules. */
  fillers: string[];
}

export interface LoadedExcerptRules {
  version: string;
  fingerprint: string;
  rules: ExcerptRules;
}

/** Thrown at boot when the rules file is missing, unparsable or invalid. */
export class ExcerptRulesValidationError extends Error {
  override readonly name = 'ExcerptRulesValidationError';
  constructor(readonly issues: string[]) {
    super(`Invalid excerpt selection rules:\n  ${issues.join('\n  ')}`);
  }
}

/**
 * sha256 over every threshold and the sorted lexicon, in a fixed key order,
 * with the version left out: two versions with identical rules share a
 * fingerprint, and a threshold changed under the same version does not.
 */
export function ruleFingerprint(rules: ExcerptRules): string {
  const { eligibility: e, selection: s } = rules;
  const canonical = JSON.stringify({
    eligibility: [
      e.minDurationMs,
      e.maxDurationMs,
      e.minWords,
      e.maxFillerShare,
      e.minConfidence,
      e.maxLowConfidenceWordShare,
    ],
    selection: [s.maxExcerpts, s.spacingWindowMs, s.maxPerWindow, s.sparseBelow],
    fillers: [...rules.fillers].sort(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Validates a parsed rules file. Never throws: every problem comes back in `issues`. */
export function parseExcerptRules(raw: unknown): { rules: ExcerptRules | null; issues: string[] } {
  const parsed = rulesFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      rules: null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const { version, eligibility, selection, fillers } = parsed.data;
  return {
    rules: {
      version,
      eligibility: {
        minDurationMs: eligibility.min_duration_ms,
        maxDurationMs: eligibility.max_duration_ms,
        minWords: eligibility.min_words,
        maxFillerShare: eligibility.max_filler_share,
        minConfidence: eligibility.min_confidence,
        maxLowConfidenceWordShare: eligibility.max_low_confidence_word_share,
      },
      selection: {
        maxExcerpts: selection.max_excerpts,
        spacingWindowMs: selection.spacing_window_ms,
        maxPerWindow: selection.max_per_window,
        sparseBelow: selection.sparse_below,
      },
      fillers: [...fillers].sort(),
    },
    issues: [],
  };
}

/** Reads, parses and validates a rules file; throws with every issue at once. */
export function loadExcerptRulesFile(filePath: string): LoadedExcerptRules {
  const label = basename(filePath);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ExcerptRulesValidationError([`${label}: could not be read or parsed — ${message}`]);
  }

  const { rules, issues } = parseExcerptRules(raw);
  if (!rules) {
    throw new ExcerptRulesValidationError(issues.map((issue) => `${label}: ${issue}`));
  }
  return { version: rules.version, fingerprint: ruleFingerprint(rules), rules };
}
