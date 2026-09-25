import type { AnalysisFailureCode, BlockedReasonCode, ScenarioContext } from '@english-quest/shared';

import type { StageRetryPolicy } from '../pipeline/pipeline-stage.handler';

/**
 * Quota, timeouts and service errors only: a schema failure or a rejected
 * request is decided inside the run and never retried on this schedule. The
 * PRD's "1, 5 and 15 minutes" read the same way F08's transcription backoff
 * does — three retries, four attempts total.
 */
export const ANALYSIS_RETRY_POLICY: StageRetryPolicy = {
  attempts: 4,
  delaysMs: [60_000, 300_000, 900_000],
};

/** The PRD's cap. Transcripts are estimated locally (no extra call) and budgeted before the request is sent. */
export const ANALYSIS_TRANSCRIPT_TOKEN_BUDGET = 12_000;

/** The usual English average for Gemini's tokenizer; Gemini's own reported count is stored alongside for calibration. */
export const ANALYSIS_CHARS_PER_TOKEN = 4;

/** An empty error list past this lesson length is a probable prompt regression, flagged for the curator rather than treated as a failure. */
export const ANALYSIS_LONG_LESSON_SECONDS = 600;

/**
 * The model has no `maxItems` bound on `errors[]` (Gemini's schema endpoint
 * rejects one combined with the taxonomy's `family:kebab-slug` enum — see
 * the Stage 2 live-check finding). The bound is enforced here instead, on
 * the errors kept after quote-matching.
 */
export const ANALYSIS_MAX_ERRORS = 25;

/** Every `CredentialUsage` row this stage writes carries this feature label — automatic, since `PromptExecutionService.execute` audits as `F04_${promptId}`. */
export const ANALYSIS_USAGE_FEATURE = 'F04_lesson-analysis';

export const ANALYSIS_REASONS: Record<BlockedReasonCode | AnalysisFailureCode, string> = {
  credential_missing: 'Blocked — add your Gemini key to analyze this lesson.',
  credential_rejected: 'Your Gemini key was rejected. Update it in settings to resume.',
  credential_unreadable: 'Your stored Gemini key could not be read. Enter it again in settings to resume.',
  analysis_quota_exceeded: 'Gemini quota exceeded.',
  analysis_timeout: 'The analysis request timed out.',
  analysis_service_error: 'Gemini could not analyze this lesson.',
  analysis_invalid_output: 'The analysis came back in an unexpected format.',
  analysis_request_rejected: 'Gemini rejected the analysis request.',
};

/** The one fixed sentence the prompt receives for `scenario_status`, per scenario context (F11's own derivation, not F06's). */
export const ANALYSIS_SCENARIO_STATUS_SENTENCES: Record<ScenarioContext, string> = {
  full: 'A scenario was in play for this lesson.',
  situation_only:
    "A scenario was in play for this lesson, but this participant's own role card could not be generated.",
  none: 'No scenario was in play for this lesson.',
};

/** Shown when pronunciation has nothing to report (F09 selected nothing, or the branch never reached F10). */
export const ANALYSIS_NO_PRONUNCIATION_SAMPLE_SENTENCE = 'No pronunciation sample was assessed for this lesson.';

/** The route's server-built note for a `situation_only` analysis, alongside the truncation note when both apply. */
export const ANALYSIS_MISSING_CARD_NOTE = 'Your role card was not available, so scenario fit was not assessed.';
