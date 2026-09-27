import type { ProfileCompetency } from '@english-quest/shared';

import type { StageRetryPolicy } from '../pipeline/pipeline-stage.handler';

/**
 * Every weight, threshold, window and cap of the learning profile (F12).
 * Each is fixed by the PRD or by F12's spec, not by the deployment, so none
 * is an environment variable.
 */

/** The PRD's weights: an hour of conversation is stronger evidence than one exercise. */
export const LESSON_MEASUREMENT_WEIGHT = 0.35;
export const ACTIVITY_MEASUREMENT_WEIGHT = 0.15;

/** Below this many measurements a competency is `Warming up` and has no trend. */
export const WARMING_UP_BELOW_MEASUREMENTS = 3;

/** A trend moves only when the score moved at least this much across its last three measurements. */
export const COMPETENCY_TREND_BAND = 2;

/** A recurring weakness: at least this many occurrences within the window. */
export const RECURRING_MIN_OCCURRENCES = 3;
export const RECURRING_WINDOW_DAYS = 30;

export const LEDGER_EXAMPLE_LIMIT = 5;

/** The compact summary's caps and budget (the PRD's 1,500 tokens). */
export const SUMMARY_WEAKNESS_LIMIT = 10;
export const SUMMARY_EXAMPLE_LIMIT = 6;
export const SUMMARY_QUOTE_MAX_CHARS = 160;
export const SUMMARY_TOKEN_BUDGET = 1_500;

/** `ProfileTagsPort` hands F06 and F11 at most this many tags. */
export const PROFILE_TAGS_LIMIT = 10;

/** The reconciliation sweep: the pipeline drain's own cadence, and a bound on one tick's work. */
export const PROFILE_RECONCILIATION_INTERVAL_MS = 15_000;
export const PROFILE_RECONCILIATION_BATCH = 50;

/** Only a database fault can fail the update, so two quick retries, then the owner can retry by hand. */
export const PROFILE_UPDATE_RETRY_POLICY: StageRetryPolicy = { attempts: 3, delaysMs: [5_000, 30_000] };

/** Matches the pipeline's completing transaction, which the profile update runs inside. */
export const PROFILE_TRANSACTION_TIMEOUT_MS = 30_000;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** F11's five, then Pronunciation — the order of every view and of the summary. */
export const PROFILE_COMPETENCIES: readonly ProfileCompetency[] = [
  'grammar',
  'vocabulary',
  'fluency',
  'interaction',
  'comprehension',
  'pronunciation',
];

export const COMPETENCY_LABELS: Record<ProfileCompetency, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  fluency: 'Fluency',
  interaction: 'Interaction',
  comprehension: 'Comprehension',
  pronunciation: 'Pronunciation',
};

export const PROFILE_SOURCE_KINDS = ['lesson_analysis', 'lesson_pronunciation', 'activity'] as const;
export type ProfileSourceKind = (typeof PROFILE_SOURCE_KINDS)[number];

/** What a measurement's `source_kind` column records, for F20's chart. */
export type MeasurementSourceKind = 'lesson' | 'activity';

export function measurementSourceKindOf(kind: ProfileSourceKind): MeasurementSourceKind {
  return kind === 'activity' ? 'activity' : 'lesson';
}

/** The weight comes from the kind, never from the caller. */
export function weightOf(kind: ProfileSourceKind): number {
  return kind === 'activity' ? ACTIVITY_MEASUREMENT_WEIGHT : LESSON_MEASUREMENT_WEIGHT;
}

/** The partial-update notes: the latest lesson updated Pronunciation only, because its analysis is blocked or failed. */
export const PARTIAL_UPDATE_BLOCKED_NOTE =
  'Only Pronunciation was updated from your latest lesson. Add your Gemini key to update the other five competencies.';
export const PARTIAL_UPDATE_FAILED_NOTE =
  "Only Pronunciation was updated from your latest lesson because its analysis failed. You can retry it from that lesson's status.";
