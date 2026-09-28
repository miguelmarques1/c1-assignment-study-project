import { join } from 'node:path';

import type { WritingFailureCode, WritingScoreDimension, WritingTaskStatus } from '@english-quest/shared';

/** The versioned task rules file, read once at boot (F17). Restart the API after editing it. */
export const WRITING_TASK_RULES_PATH = join(process.cwd(), 'rules', 'writing-tasks.yaml');

/** The schema declares no `maxItems` (F11's live finding); this is where the cap actually lives. */
export const WRITING_MAX_ERRORS = 30;

/** How long a `running` correction may hold its lease before the sweep reclaims it (A10). */
export const WRITING_CORRECTION_LEASE_MS = 7 * 60 * 1000;

/** The recovery sweep's own cadence (A10). */
export const WRITING_SWEEP_INTERVAL_MS = 30 * 1000;

/** At most this many expired leases reclaimed per tick. */
export const WRITING_SWEEP_BATCH = 5;

/** One automatic retry, this long after the first request failure (A11). */
export const WRITING_AUTO_RETRY_DELAY_MS = 5 * 1000;

/** `hashtextextended` namespace prefix for the per-user daily-limit advisory lock (A14). */
export const WRITING_LIMIT_LOCK_NAMESPACE = 'writing-limit:';

/**
 * Replaces the runner's and the sweep's own timings. Production provides no
 * override; the integration suites shorten the retry delay and the lease so
 * a two-request correction and a reclaimed lease each take milliseconds
 * instead of minutes, as the pipeline's `PIPELINE_RETRY_OVERRIDES` does.
 */
export const WRITING_OPTIONS = Symbol('WRITING_OPTIONS');
export interface WritingOptions {
  autoRetryDelayMs: number;
  correctionLeaseMs: number;
}
export const WRITING_DEFAULT_OPTIONS: WritingOptions = {
  autoRetryDelayMs: WRITING_AUTO_RETRY_DELAY_MS,
  correctionLeaseMs: WRITING_CORRECTION_LEASE_MS,
};

/** Order and labels for every `WritingCorrectionView.scores` entry (spec §5). */
export const WRITING_SCORE_DIMENSIONS: readonly WritingScoreDimension[] = [
  'grammar',
  'vocabulary',
  'coherence',
  'task_achievement',
];
export const WRITING_SCORE_LABELS: Record<WritingScoreDimension, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  coherence: 'Coherence',
  task_achievement: 'Task achievement',
};

/** Server-built, in `failure.message` (spec §5 "Failure messages"). */
export const WRITING_FAILURE_MESSAGES: Record<WritingFailureCode, string> = {
  request_failed: 'Correction failed. Your text is saved — retry when ready.',
  gemini_key: 'Add your Gemini key to have your writing corrected.',
  invalid_output: 'The correction came back in an unexpected format. Your text is saved — retry when ready.',
};

/** The task status a correction failure leaves behind (A12). */
export const WRITING_FAILURE_STATUS: Record<WritingFailureCode, Extract<WritingTaskStatus, 'uncorrected' | 'correction_failed'>> = {
  request_failed: 'uncorrected',
  gemini_key: 'uncorrected',
  invalid_output: 'correction_failed',
};

/** `PromptExecutionService.execute`'s own feature label for telemetry (F04's convention: `F<feature>_<promptId>`). */
export const WRITING_PROMPT_ID = 'writing-correct';

/** The analysis-family tags a writing task may ever target — never `phoneme:` (A3). */
export const WRITING_ANALYSIS_FAMILIES: readonly string[] = ['grammar', 'vocab', 'discourse'];
