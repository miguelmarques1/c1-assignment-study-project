import { join } from 'node:path';

import type { GeneratedContentType } from '@english-quest/shared';

/** Found next to `prompts/`, the same way the prompt library and the taxonomy are. Read once at boot. */
export const GENERATION_RULES_PATH = join(process.cwd(), 'rules', 'content-generation.yaml');

/** The gate's reference data (PRD F14). Missing or unreadable, it stops the API from booting. */
export const FREQUENCY_LIST_PATH = join(process.cwd(), 'rules', 'frequency', 'en-lemmas-top5000.tsv');

/** The PRD's cap: "capped at 12 items per run". A rules file may lower the mix, never raise it past this. */
export const MAX_ITEMS_PER_RUN = 12;

/** Slots in flight at once in one run: keeps a batch within minutes without bursting a free-tier rate limit (spec A2). */
export const SLOT_CONCURRENCY = 2;

/**
 * A claimed slot whose worker died is reclaimable after this long: above a
 * slot's worst case of 2 attempts × 2 calls × 90 s (spec A3).
 */
export const SLOT_LEASE_MS = 10 * 60 * 1000;

/** Plan notes (spec A5). The first is the PRD's wording; F15 decides where each one shows. */
export const GENERATION_NOTES = {
  gemini_key_missing: 'Some activities use existing material because your Gemini key is missing.',
  gemini_quota_exhausted: 'Some activities use existing material because your Gemini quota ran out.',
} as const;

/** The prompt each generated type is written by (F04's library; version 2 is F14's shape). */
export const GENERATION_PROMPT_IDS = {
  reading: 'reading-generate',
  vocabulary: 'vocabulary-generate',
  grammar: 'grammar-generate',
  error_review: 'error-review-generate',
} as const satisfies Record<GeneratedContentType, string>;
