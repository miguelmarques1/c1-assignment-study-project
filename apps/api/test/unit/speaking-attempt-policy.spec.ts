import { describe, expect, it } from 'vitest';

import {
  bestAttempt,
  blockFor,
  canRescore,
  canUpload,
  isRescorable,
  isStale,
  type AttemptSummary,
} from '../../src/speaking/scoring/attempt-policy';
import { SCORING_LEASE_MS } from '../../src/speaking/speaking.constants';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function attempt(overrides: Partial<AttemptSummary> & { id: string; state: AttemptSummary['state'] }): AttemptSummary {
  return { ordinal: null, scoringStartedAt: null, failureCode: null, pronunciation: null, ...overrides };
}

describe('blockFor', () => {
  it('blocks_on_a_missing_or_invalid_azure_key_but_not_unverified', () => {
    const base = { planStatus: 'active' as const, activityState: 'pending' as const };

    expect(blockFor({ ...base, azureStatus: 'missing' })).toBe('azure_key_missing');
    expect(blockFor({ ...base, azureStatus: 'invalid' })).toBe('azure_key_missing');
    expect(blockFor({ ...base, azureStatus: 'unverified' })).toBeNull();
    expect(blockFor({ ...base, azureStatus: 'valid' })).toBeNull();
  });

  it('archived_comes_before_skipped_before_key', () => {
    expect(blockFor({ planStatus: 'archived', activityState: 'skipped', azureStatus: 'missing' })).toBe('plan_archived');
    expect(blockFor({ planStatus: 'active', activityState: 'skipped', azureStatus: 'missing' })).toBe('activity_skipped');
    expect(blockFor({ planStatus: 'active', activityState: 'pending', azureStatus: 'missing' })).toBe('azure_key_missing');
    expect(blockFor({ planStatus: 'active', activityState: 'pending', azureStatus: 'valid' })).toBeNull();
  });
});

describe('canUpload', () => {
  it('refuses_a_fourth_scored_attempt', () => {
    const attempts = [
      attempt({ id: 'a', state: 'scored', ordinal: 1, pronunciation: 70 }),
      attempt({ id: 'b', state: 'scored', ordinal: 2, pronunciation: 60 }),
      attempt({ id: 'c', state: 'scored', ordinal: 3, pronunciation: 80 }),
    ];

    expect(canUpload(attempts, NOW)).toEqual({ allowed: false, reason: 'attempt_limit' });
  });

  it('refuses_while_another_attempt_is_scoring', () => {
    const attempts = [attempt({ id: 'a', state: 'scoring', scoringStartedAt: NOW })];

    expect(canUpload(attempts, NOW)).toEqual({ allowed: false, reason: 'scoring_in_flight' });
  });

  it('a_stale_scoring_attempt_is_interrupted_and_frees_the_slot', () => {
    const staleStart = new Date(NOW.getTime() - SCORING_LEASE_MS - 1_000);
    const attempts = [attempt({ id: 'a', state: 'scoring', scoringStartedAt: staleStart })];

    expect(isStale(attempts[0]!, NOW)).toBe(true);
    expect(canUpload(attempts, NOW)).toEqual({ allowed: true });
  });

  it('allows_an_upload_under_the_limit_with_nothing_scoring', () => {
    const attempts = [attempt({ id: 'a', state: 'scored', ordinal: 1, pronunciation: 70 })];

    expect(canUpload(attempts, NOW)).toEqual({ allowed: true });
  });
});

describe('canRescore', () => {
  it('transient_failures_are_rescorable_and_audio_failures_are_not', () => {
    expect(isRescorable('service_error')).toBe(true);
    expect(isRescorable('azure_quota')).toBe(true);
    expect(isRescorable('interrupted')).toBe(true);
    expect(isRescorable('audio_rejected')).toBe(false);
    expect(isRescorable('audio_missing')).toBe(false);
    expect(isRescorable('not_enough_speech')).toBe(false);

    const failed = attempt({ id: 'a', state: 'failed', failureCode: 'service_error' });
    expect(canRescore(failed, [failed], NOW)).toEqual({ allowed: true });

    const rejected = attempt({ id: 'b', state: 'failed', failureCode: 'audio_rejected' });
    expect(canRescore(rejected, [rejected], NOW)).toEqual({ allowed: false, reason: 'not_transient' });
  });

  it('refuses_a_rescore_of_a_scored_attempt', () => {
    const scored = attempt({ id: 'a', state: 'scored', ordinal: 1, pronunciation: 70 });
    expect(canRescore(scored, [scored], NOW)).toEqual({ allowed: false, reason: 'not_failed' });
  });

  it('a_stale_scoring_attempt_is_rescorable_as_interrupted', () => {
    const staleStart = new Date(NOW.getTime() - SCORING_LEASE_MS - 1_000);
    const stale = attempt({ id: 'a', state: 'scoring', scoringStartedAt: staleStart });

    expect(canRescore(stale, [stale], NOW)).toEqual({ allowed: true });
  });

  it('refuses_a_rescore_past_the_limit', () => {
    const failed = attempt({ id: 'd', state: 'failed', failureCode: 'service_error' });
    const attempts = [
      attempt({ id: 'a', state: 'scored', ordinal: 1, pronunciation: 70 }),
      attempt({ id: 'b', state: 'scored', ordinal: 2, pronunciation: 60 }),
      attempt({ id: 'c', state: 'scored', ordinal: 3, pronunciation: 80 }),
      failed,
    ];

    expect(canRescore(failed, attempts, NOW)).toEqual({ allowed: false, reason: 'attempt_limit' });
  });

  it('refuses_a_rescore_while_a_different_attempt_is_scoring', () => {
    const failed = attempt({ id: 'a', state: 'failed', failureCode: 'service_error' });
    const scoring = attempt({ id: 'b', state: 'scoring', scoringStartedAt: NOW });

    expect(canRescore(failed, [failed, scoring], NOW)).toEqual({ allowed: false, reason: 'scoring_in_flight' });
  });
});

describe('bestAttempt', () => {
  it('best_attempt_is_the_highest_pronunciation_with_the_earlier_ordinal_winning_a_tie', () => {
    const attempts = [
      attempt({ id: 'a', state: 'scored', ordinal: 1, pronunciation: 70 }),
      attempt({ id: 'b', state: 'scored', ordinal: 2, pronunciation: 81 }),
      attempt({ id: 'c', state: 'scored', ordinal: 3, pronunciation: 81 }),
      attempt({ id: 'd', state: 'failed', failureCode: 'service_error' }),
    ];

    expect(bestAttempt(attempts)?.id).toBe('b');
  });

  it('returns_null_with_no_scored_attempts', () => {
    expect(bestAttempt([attempt({ id: 'a', state: 'failed' })])).toBeNull();
  });
});
