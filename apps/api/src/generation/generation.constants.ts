import { join } from 'node:path';

import type { GeneratedContentType } from '@english-quest/shared';

/** Found next to `prompts/`, the same way the prompt library and the taxonomy are. Read once at boot. */
export const GENERATION_RULES_PATH = join(process.cwd(), 'rules', 'content-generation.yaml');

/** The gate's reference data (PRD F14). Missing or unreadable, it stops the API from booting. */
export const FREQUENCY_LIST_PATH = join(process.cwd(), 'rules', 'frequency', 'en-lemmas-top5000.tsv');

/** The PRD's cap: "capped at 12 items per run". A rules file may lower the mix, never raise it past this. */
export const MAX_ITEMS_PER_RUN = 12;

/** The prompt each generated type is written by (F04's library; version 2 is F14's shape). */
export const GENERATION_PROMPT_IDS = {
  reading: 'reading-generate',
  vocabulary: 'vocabulary-generate',
  grammar: 'grammar-generate',
  error_review: 'error-review-generate',
} as const satisfies Record<GeneratedContentType, string>;
