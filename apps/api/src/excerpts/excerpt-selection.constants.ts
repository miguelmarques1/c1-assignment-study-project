import { join } from 'node:path';

import type { StageRetryPolicy } from '../pipeline/pipeline-stage.handler';

/**
 * Selection is pure computation over rows already in Postgres, so the only
 * transient faults are database ones: two quick retries are plenty.
 */
export const EXCERPT_SELECTION_RETRY_POLICY: StageRetryPolicy = {
  attempts: 3,
  delaysMs: [5_000, 30_000],
};

/** Found next to `prompts/`, the same way the prompt library is. */
export const EXCERPT_RULES_PATH = join(process.cwd(), 'rules', 'excerpt-selection.yaml');

/**
 * The PRD's bound on assessed audio per participant per lesson (12 × 30 s).
 * F10's cost criterion rests on it, so no rules file may be able to exceed it.
 */
export const MAX_SELECTED_AUDIO_MS = 6 * 60 * 1000;
