import type { CredentialStatus, PlanActivityState, SpeakingBlock, SpeakingFailureCode, StudyPlanStatus } from '@english-quest/shared';

import { SCORING_LEASE_MS, SPEAKING_MAX_ATTEMPTS, SPEAKING_RESCORABLE } from '../speaking.constants';

export interface AttemptSummary {
  id: string;
  state: 'scoring' | 'scored' | 'discarded' | 'failed';
  ordinal: number | null;
  scoringStartedAt: Date | null;
  failureCode: SpeakingFailureCode | null;
  pronunciation: number | null;
}

/**
 * Why nothing can be recorded on this activity, most fundamental first: an
 * archived plan outranks a skipped activity, which outranks a missing or
 * rejected Azure key (A12, A18, A20). `valid` and `unverified` both count as
 * usable — the vault's `resolveDecrypted` accepts both.
 */
export function blockFor(input: {
  planStatus: StudyPlanStatus;
  activityState: PlanActivityState;
  azureStatus: CredentialStatus;
}): SpeakingBlock | null {
  if (input.planStatus === 'archived') {
    return 'plan_archived';
  }
  if (input.activityState === 'skipped') {
    return 'activity_skipped';
  }
  if (input.azureStatus === 'missing' || input.azureStatus === 'invalid') {
    return 'azure_key_missing';
  }
  return null;
}

/** A `scoring` row whose lease has run out — a crash mid-request (A13). */
export function isStale(attempt: Pick<AttemptSummary, 'state' | 'scoringStartedAt'>, now: Date): boolean {
  return (
    attempt.state === 'scoring' &&
    attempt.scoringStartedAt !== null &&
    now.getTime() - attempt.scoringStartedAt.getTime() > SCORING_LEASE_MS
  );
}

export function isRescorable(code: SpeakingFailureCode): boolean {
  return SPEAKING_RESCORABLE[code];
}

export type UploadBlockedReason = 'attempt_limit' | 'scoring_in_flight';
export type UploadDecision = { allowed: true } | { allowed: false; reason: UploadBlockedReason };

/**
 * A new upload needs fewer than 3 scored attempts and no attempt still
 * scoring (A10). A `scoring` row past its lease no longer holds the slot —
 * the service converts it to `failed`/`interrupted` in the same
 * transaction this check runs under, so the two never disagree.
 */
export function canUpload(attempts: readonly AttemptSummary[], now: Date): UploadDecision {
  const scoredCount = attempts.filter((attempt) => attempt.state === 'scored').length;
  if (scoredCount >= SPEAKING_MAX_ATTEMPTS) {
    return { allowed: false, reason: 'attempt_limit' };
  }
  if (attempts.some((attempt) => attempt.state === 'scoring' && !isStale(attempt, now))) {
    return { allowed: false, reason: 'scoring_in_flight' };
  }
  return { allowed: true };
}

export type RescoreBlockedReason = 'not_failed' | 'not_transient' | 'attempt_limit' | 'scoring_in_flight';
export type RescoreDecision = { allowed: true } | { allowed: false; reason: RescoreBlockedReason };

/**
 * A re-score needs the target attempt to be `failed` with a re-scorable
 * code — or `scoring` past its lease, read as `interrupted` (A13) — plus
 * the same limit and in-flight rules as an upload, excluding the target
 * attempt itself from the in-flight check (it is the one being re-scored).
 */
export function canRescore(attempt: AttemptSummary, attempts: readonly AttemptSummary[], now: Date): RescoreDecision {
  const stale = isStale(attempt, now);
  if (attempt.state !== 'failed' && !stale) {
    return { allowed: false, reason: 'not_failed' };
  }
  const effectiveCode: SpeakingFailureCode | null = stale ? 'interrupted' : attempt.failureCode;
  if (!effectiveCode || !isRescorable(effectiveCode)) {
    return { allowed: false, reason: 'not_transient' };
  }

  const scoredCount = attempts.filter((candidate) => candidate.state === 'scored').length;
  if (scoredCount >= SPEAKING_MAX_ATTEMPTS) {
    return { allowed: false, reason: 'attempt_limit' };
  }
  const inFlight = attempts.some(
    (candidate) => candidate.id !== attempt.id && candidate.state === 'scoring' && !isStale(candidate, now),
  );
  if (inFlight) {
    return { allowed: false, reason: 'scoring_in_flight' };
  }
  return { allowed: true };
}

/** The scored attempt the profile should reflect: highest pronunciation, the earlier ordinal winning a tie (A16). */
export function bestAttempt(attempts: readonly AttemptSummary[]): AttemptSummary | null {
  const scored = attempts.filter((attempt) => attempt.state === 'scored');
  if (scored.length === 0) {
    return null;
  }
  return scored.reduce((best, candidate) => {
    if (candidate.pronunciation! > best.pronunciation!) {
      return candidate;
    }
    if (candidate.pronunciation! === best.pronunciation! && (candidate.ordinal ?? Infinity) < (best.ordinal ?? Infinity)) {
      return candidate;
    }
    return best;
  });
}
