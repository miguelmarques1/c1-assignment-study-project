import { z } from 'zod';

import { excerptPronunciationSchema } from './pronunciation';

/**
 * Why one of the caller's own utterances was chosen for pronunciation
 * assessment (F09). It rides on the transcript line the badge sits on, and
 * only ever on the caller's own utterances: the choice derives from
 * recognition confidence and pronunciation targets, both private.
 */
export const transcriptExcerptSchema = z.object({
  /** 1-based order in which the selection accepted it. */
  rank: z.number().int().positive(),
  /** The badge sentence, e.g. `Selected: recognition confidence 0.62, 14 words`. */
  reason: z.string(),
  /** The confidence it was ranked on; null when the provider gave none. */
  confidence: z.number().min(0).max(1).nullable(),
  wordCount: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  /** Words matching the caller's unmastered pronunciation tags. */
  focusWordCount: z.number().int().nonnegative(),
  /** The `selection_rule_version` in force when it was chosen. */
  ruleVersion: z.string(),
  /** This excerpt's pronunciation assessment (F10). Identical shape and values to the pronunciation route's own entry. */
  pronunciation: excerptPronunciationSchema,
});
export type TranscriptExcerpt = z.infer<typeof transcriptExcerptSchema>;

/** The caller's own selection for a lesson, as counts. Another participant's is never summarized. */
export const excerptSelectionSummarySchema = z.object({
  ruleVersion: z.string(),
  /** Utterances considered. */
  utteranceCount: z.number().int().nonnegative(),
  /** Utterances that passed every eligibility filter. */
  eligibleCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  /** Total selected audio; at most 6 minutes by construction. */
  selectedAudioMs: z.number().int().nonnegative(),
  /** Fewer than 4 excerpts were selected, so the pronunciation aggregate is less reliable. */
  sparsePronunciationSample: z.boolean(),
});
export type ExcerptSelectionSummary = z.infer<typeof excerptSelectionSummarySchema>;
