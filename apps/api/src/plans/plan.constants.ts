import { join } from 'node:path';

import type { StageRetryPolicy } from '../pipeline/pipeline-stage.handler';

/** Found next to `prompts/`, the same way the generation rules and the taxonomy are. Read once at boot. */
export const STUDY_PLAN_RULES_PATH = join(process.cwd(), 'rules', 'study-plan.yaml');

/** `plan_generation` never blocks (spec A4): a missing key composes deterministically instead. */
export const PLAN_GENERATION_RETRY_POLICY: StageRetryPolicy = { attempts: 3, delaysMs: [60_000, 300_000] };

/** How often `PlanRequestJob` ticks, and how many requests it claims per tick (spec A28). */
export const PLAN_REQUEST_INTERVAL_MS = 15_000;
export const PLAN_REQUEST_BATCH = 2;
/** Above a worst-case F14 run (spec's ~36 minutes) plus the composition call. */
export const PLAN_REQUEST_LEASE_MS = 15 * 60 * 1000;
export const PLAN_REQUEST_MAX_ATTEMPTS = 3;
export const PLAN_REQUEST_RETRY_DELAYS_MS = [60_000, 300_000];

/** The advisory lock's namespace, hashed together with the user id (spec A19). */
export const PLAN_LOCK_NAMESPACE = 'study-plan:';

/** Precedence tiers (spec A1): a `lesson` plan always outranks a same-lesson-time fallback or interim plan. */
export const ORIGIN_RANK = {
  recording_failed: 1,
  analysis_blocked: 1,
  lesson: 2,
} as const;

/** Server-built note texts (spec A15), in the fixed order they are shown. */
export const PLAN_NOTES = {
  recording_failed: "Built from your existing profile because this lesson's recording failed.",
  gemini_key_missing: 'Built from existing material because your Gemini key is missing.',
  gemini_quota_exhausted: 'Built from existing material because your Gemini quota ran out.',
  general_material: 'Built from general C1 material because your profile has no weaknesses recorded yet.',
  missing_listening: 'No listening activity this week: the content bank has no unseen items at your level.',
  missing_reading: 'No reading activity this week: the content bank has no unseen items at your level.',
} as const;

/** The order notes are shown in, when more than one applies (spec A15). */
export const PLAN_NOTE_ORDER = [
  'recording_failed',
  'gemini_key_missing',
  'gemini_quota_exhausted',
  'general_material',
  'missing_listening',
  'missing_reading',
] as const;

/** The user-facing message on a plan build that failed after every retry (spec §5). */
export function planFailureMessage(hasActivePlan: boolean): string {
  return hasActivePlan
    ? 'We could not build a new plan. Your previous plan is still available.'
    : 'We could not build a new plan.';
}
