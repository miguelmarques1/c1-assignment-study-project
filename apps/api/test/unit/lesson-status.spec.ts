import { describe, expect, it } from 'vitest';

import {
  coarseStages,
  deriveLessonStatus,
  type BranchSnapshot,
  type LessonStatusSource,
  type StageSnapshot,
} from '../../src/lessons/lesson-status';

const STARTED = new Date('2026-09-24T14:10:03.000Z');
const FINALIZED = new Date('2026-09-24T15:03:30.000Z');

function lesson(overrides: Partial<LessonStatusSource> = {}): LessonStatusSource {
  return { status: 'ended', recordingStatus: 'recorded', startedAt: STARTED, recordingFinalizedAt: FINALIZED, ...overrides };
}

function row(stage: string, status: string, reason: string | null = null): StageSnapshot {
  return {
    stage,
    status,
    reason,
    startedAt: new Date('2026-09-24T15:04:00.000Z'),
    finishedAt: status === 'completed' || status === 'failed' ? new Date('2026-09-24T15:05:00.000Z') : null,
  };
}

function branch(stage: string, status: string, stages: StageSnapshot[] = [], failureReason: string | null = null): BranchSnapshot {
  return { stage, status, failureReason, launchedAt: new Date('2026-09-24T15:03:30.000Z'), stages };
}

const UPSTREAM_DONE = [
  row('transcription', 'completed'),
  row('excerpt_selection', 'completed'),
  row('pronunciation_assessment', 'completed'),
];

describe('deriveLessonStatus', () => {
  it('too_short_and_recording_failed_win_over_everything', () => {
    const ready = branch('profile_update', 'queued', [...UPSTREAM_DONE, row('lesson_analysis', 'completed')]);
    expect(deriveLessonStatus(lesson({ recordingStatus: 'too_short' }), ready, 'ready')).toEqual({
      status: 'too_short',
      flags: [],
      activeStage: null,
      statusReason: 'Too short to analyze (minimum 3 minutes)',
    });
    expect(deriveLessonStatus(lesson({ recordingStatus: 'recording_failed' }), null, 'ready')).toMatchObject({
      status: 'recording_failed',
      activeStage: null,
      statusReason: 'This lesson was not recorded, so it could not be analyzed.',
    });
    expect(deriveLessonStatus(lesson({ recordingStatus: 'recording_failed' }), ready, 'ready').status).toBe('recording_failed');
  });

  it('no_branch_while_finalizing_is_processing_at_recording', () => {
    for (const recordingStatus of ['idle', 'starting', 'recording', 'not_recording', 'finalizing']) {
      expect(deriveLessonStatus(lesson({ recordingStatus }), null, 'ready')).toMatchObject({
        status: 'processing',
        activeStage: 'recording',
        statusReason: null,
      });
    }
  });

  it('no_branch_after_finalization_fails_with_the_fixed_sentence', () => {
    expect(deriveLessonStatus(lesson({ recordingStatus: 'storage_unavailable' }), null, 'ready')).toMatchObject({
      status: 'failed',
      activeStage: 'recording',
      statusReason: 'Storage was unavailable when this recording was verified.',
    });
    for (const recordingStatus of ['recorded', 'recording_partial']) {
      expect(deriveLessonStatus(lesson({ recordingStatus }), null, 'ready')).toMatchObject({
        status: 'failed',
        activeStage: null,
        statusReason: 'You were not in this lesson after it started, so it has no result for you.',
      });
    }
  });

  it('a_failed_branch_is_failed_with_its_reason_at_any_stage', () => {
    const atTranscription = branch(
      'transcription',
      'failed',
      [row('transcription', 'failed', 'Azure Speech could not transcribe this recording.')],
      'Azure Speech could not transcribe this recording.',
    );
    expect(deriveLessonStatus(lesson(), atTranscription, 'ready')).toMatchObject({
      status: 'failed',
      activeStage: 'transcription',
      statusReason: 'Azure Speech could not transcribe this recording.',
    });

    // A later stage failing after a completed analysis still turns the row to Failed (A3).
    const atProfile = branch(
      'profile_update',
      'failed',
      [...UPSTREAM_DONE, row('lesson_analysis', 'completed'), row('profile_update', 'failed', 'Profile update failed.')],
      'Profile update failed.',
    );
    expect(deriveLessonStatus(lesson(), atProfile, 'ready')).toMatchObject({
      status: 'failed',
      activeStage: 'profile_update',
      statusReason: 'Profile update failed.',
    });

    const storage = branch('recording', 'storage_unavailable');
    expect(deriveLessonStatus(lesson(), storage, 'ready')).toMatchObject({
      status: 'failed',
      activeStage: 'recording',
      statusReason: 'Storage was unavailable when this recording was verified.',
    });
  });

  it('a_blocked_branch_carries_the_stage_reason', () => {
    const blocked = branch('lesson_analysis', 'blocked_missing_key', [
      ...UPSTREAM_DONE,
      row('lesson_analysis', 'blocked_missing_key', 'Blocked — add your Gemini key to analyze this lesson.'),
    ]);
    expect(deriveLessonStatus(lesson(), blocked, 'ready')).toEqual({
      status: 'blocked',
      flags: [],
      activeStage: 'lesson_analysis',
      statusReason: 'Blocked — add your Gemini key to analyze this lesson.',
    });
  });

  it('completed_analysis_is_ready_even_while_profile_update_waits', () => {
    const waiting = branch('profile_update', 'queued', [
      ...UPSTREAM_DONE,
      row('lesson_analysis', 'completed'),
      row('profile_update', 'queued'),
    ]);
    expect(deriveLessonStatus(lesson(), waiting, 'ready')).toEqual({
      status: 'ready',
      flags: [],
      activeStage: null,
      statusReason: null,
    });
  });

  it('anything_else_is_processing_at_the_pointer_stage', () => {
    const cases: Array<[string, string]> = [
      ['recording', 'verifying'],
      ['transcription', 'queued'],
      ['pronunciation_assessment', 'running'],
      ['lesson_analysis', 'retrying'],
    ];
    for (const [stage, status] of cases) {
      expect(deriveLessonStatus(lesson(), branch(stage, status, [row(stage, status)]), 'ready')).toMatchObject({
        status: 'processing',
        activeStage: stage,
        statusReason: null,
      });
    }
  });

  it('flags_are_independent_of_the_status', () => {
    const ready = branch('profile_update', 'queued', [...UPSTREAM_DONE, row('lesson_analysis', 'completed')]);
    const blocked = branch('transcription', 'blocked_missing_key', [row('transcription', 'blocked_missing_key', 'Blocked.')]);

    for (const [target, status] of [
      [ready, 'ready'],
      [blocked, 'blocked'],
    ] as const) {
      expect(deriveLessonStatus(lesson({ recordingStatus: 'recording_partial' }), target, 'ready')).toMatchObject({
        status,
        flags: ['partial'],
      });
      for (const scenario of ['no_scenario', 'failed', 'pending', 'none'] as const) {
        expect(deriveLessonStatus(lesson(), target, scenario)).toMatchObject({ status, flags: ['no_scenario'] });
      }
      expect(deriveLessonStatus(lesson({ status: 'ended_unexpectedly' }), target, 'ready')).toMatchObject({
        status,
        flags: ['ended_unexpectedly'],
      });
      expect(
        deriveLessonStatus(lesson({ status: 'ended_unexpectedly', recordingStatus: 'recording_partial' }), target, 'none'),
      ).toMatchObject({ status, flags: ['partial', 'no_scenario', 'ended_unexpectedly'] });
    }
    // A failed role card alone is not a no-scenario lesson: only the situation's status counts.
    expect(deriveLessonStatus(lesson(), ready, 'ready').flags).toEqual([]);
  });
});

describe('coarseStages', () => {
  it('others_stages_are_coarse_and_complete', () => {
    const stages = coarseStages(
      branch('lesson_analysis', 'blocked_missing_key', [
        row('transcription', 'completed', 'should never appear'),
        row('excerpt_selection', 'failed', 'secret reason'),
        row('pronunciation_assessment', 'retrying'),
        row('lesson_analysis', 'blocked_missing_key', 'Blocked — add your Gemini key.'),
      ]),
      lesson(),
    );

    expect(stages.map((stage) => stage.stage)).toEqual([
      'recording',
      'transcription',
      'excerpt_selection',
      'pronunciation_assessment',
      'lesson_analysis',
      'profile_update',
      'plan_generation',
    ]);
    expect(stages.map((stage) => stage.state)).toEqual([
      'completed',
      'completed',
      'unavailable',
      'pending',
      'pending',
      'not_started',
      'not_started',
    ]);
    // Times only on completed stages; the recording spans the lesson to its finalization.
    expect(stages[0]).toEqual({
      stage: 'recording',
      state: 'completed',
      startedAt: STARTED.toISOString(),
      finishedAt: FINALIZED.toISOString(),
    });
    expect(stages[1]!.startedAt).not.toBeNull();
    for (const stage of stages.slice(2)) {
      expect(stage.startedAt).toBeNull();
      expect(stage.finishedAt).toBeNull();
    }
    for (const stage of stages) {
      expect(Object.keys(stage).sort()).toEqual(['finishedAt', 'stage', 'startedAt', 'state']);
    }
    expect(JSON.stringify(stages)).not.toContain('reason');
  });

  it('a_recording_failure_is_unavailable_and_nothing_after_it_started', () => {
    const failed = coarseStages({ ...branch('recording', 'failed', [], 'Recording missing.'), launchedAt: null }, lesson());
    expect(failed.map((stage) => stage.state)).toEqual([
      'unavailable',
      'not_started',
      'not_started',
      'not_started',
      'not_started',
      'not_started',
      'not_started',
    ]);

    const verifying = coarseStages({ ...branch('recording', 'verifying'), launchedAt: null }, lesson({ recordingStatus: 'finalizing' }));
    expect(verifying[0]!.state).toBe('pending');
  });

  it('no_branch_is_pending_while_finalizing_and_unavailable_after', () => {
    expect(coarseStages(null, lesson({ recordingStatus: 'finalizing' }))[0]!.state).toBe('pending');
    const after = coarseStages(null, lesson());
    expect(after[0]!.state).toBe('unavailable');
    expect(after.slice(1).every((stage) => stage.state === 'not_started')).toBe(true);
  });
});
