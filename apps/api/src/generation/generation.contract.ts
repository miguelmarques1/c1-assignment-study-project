import type { GeneratedContentType, GeneratedItemInput } from '@english-quest/shared';

/**
 * The shapes F14 exchanges internally and with its callers. Nothing here
 * reaches a client: generation has no route (spec §5), so these types stay
 * in the API rather than in `@english-quest/shared`.
 */

/** The gate's checks, in the order they are reported. */
export const GATE_CHECKS = [
  'word_count',
  'mean_sentence_length',
  'type_token_ratio',
  'out_of_frequency_ratio',
  'target_structures',
  'banned_phrases',
  'questions',
  'answer_evidence',
  'item_shape',
  'learner_quotes',
] as const;
export type GateCheckName = (typeof GATE_CHECKS)[number];

/** One question as the generation prompts' flat schema returns it (spec A11). */
export interface ModelQuestion {
  format: string;
  prompt: string;
  options?: string[];
  answer?: string;
  accepted_answers?: string[];
  explanation: string;
  evidence: string;
}

export interface ModelOccurrence {
  tag: string;
  quote: string;
}

/** What a `*-generate` prompt returns, version 2. */
export interface GeneratedItemOutput {
  title: string;
  topic: string;
  body: string;
  questions: ModelQuestion[];
  target_occurrences: ModelOccurrence[];
}

/** One target tag's verified occurrences (spec §5, `gate_metrics.target_structures`). */
export interface TagOccurrenceReport {
  occurrences: number;
  /** 1-based thirds of the body the counted occurrences start in, ascending. */
  thirds: number[];
  rejected: Array<{ quote: string; reason: OccurrenceRejection }>;
}

export type OccurrenceRejection =
  | 'not in the text'
  | 'overlaps another occurrence'
  | 'no marker match'
  | 'too short'
  | 'too long';

/** A failed check with what was measured, for the curator's record and the regeneration notes. */
export type GateFailure =
  | { check: 'word_count'; measured: number; min: number; max: number }
  | { check: 'mean_sentence_length'; measured: number; min: number; max: number }
  | { check: 'type_token_ratio'; measured: number; min: number }
  | { check: 'out_of_frequency_ratio'; measured: number; min: number; cutoff: number }
  | {
      check: 'target_structures';
      tags: Array<{ tag: string; occurrences: number; thirds: number; rejected: number; minOccurrences: number; minThirds: number }>;
    }
  | { check: 'banned_phrases'; found: Array<{ phrase: string; count: number }> }
  | { check: 'questions'; issues: string[] }
  | { check: 'answer_evidence'; issues: string[] }
  | { check: 'item_shape'; issues: string[] }
  | { check: 'learner_quotes'; reproduced: number };

/**
 * `gate_metrics` as stored: on the passing item (with `answer_evidence`) and
 * on every attempt row (without it: a failed attempt keeps numbers, never
 * text, spec A23). Ratios are fractions, rounded for reading.
 */
export interface GateMetrics {
  rules_version: string;
  frequency_list: string;
  attempt: number;
  genre: string | null;
  topic_domain: string;
  exemplar_index: number;
  word_count: number;
  sentence_count: number;
  mean_sentence_length: number;
  type_token_ratio: number;
  out_of_frequency_ratio: number;
  frequency_bands: { k1: number; k2: number; k3: number; k4_5: number; off_list: number };
  target_structures: Record<string, { occurrences: number; thirds: number[]; rejected: number }>;
  banned_phrases_found: Array<{ phrase: string; count: number }>;
  questions: number;
  checks: Record<GateCheckName, 'pass' | 'fail'>;
  answer_evidence?: string[];
}

export interface GateReport {
  passed: boolean;
  failedChecks: GateCheckName[];
  failures: GateFailure[];
  /** Without `answer_evidence`; see `GateMetrics`. */
  metrics: GateMetrics;
  /** The evidence quotes, in question order, for the passing item's metrics. */
  evidence: string[];
  /** The bank input with the final metrics, ready for `saveGenerated`; null unless the gate passed. */
  item: GeneratedItemInput | null;
}

/** The slot facts the mapper and the gate need. */
export interface SlotSpec {
  slotId: string;
  type: GeneratedContentType;
  targetTags: string[];
  attempt: number;
  genre: string | null;
  topicDomain: string;
  exemplarIndex: number;
}
