import { describe, expect, it } from 'vitest';

import {
  classifyParticipant,
  deriveLessonStatus,
  type ParticipantClassification,
  type ParticipantClassificationInput,
} from '../../src/recording/recording-classifier';

/** A fully successful base case — each scenario below overrides only what it needs to test. */
function baseInput(overrides: Partial<ParticipantClassificationInput> = {}): ParticipantClassificationInput {
  return {
    liveStatus: 'recording',
    assemblyAttempted: true,
    capturedMs: 300_000,
    hadUnexpectedEnd: false,
    assemblyFailed: false,
    verifiedAudio: { bytes: 500_000, durationMs: 300_000 },
    ...overrides,
  };
}

describe('classifyParticipant', () => {
  it('classifies_every_participant_outcome', () => {
    const complete = classifyParticipant(baseInput());
    expect(complete.recordingStatus).toBe('complete');
    expect(complete.launches).toBe(true);
    expect(complete.failureCode).toBeNull();
    expect(complete.retryable).toBe(false);
    expect(complete.requiresFallbackPlan).toBe(false);

    const partialOverThreeMinutes = classifyParticipant(
      baseInput({ liveStatus: 'stopped', capturedMs: 200_000, hadUnexpectedEnd: true }),
    );
    expect(partialOverThreeMinutes.recordingStatus).toBe('partial');
    expect(partialOverThreeMinutes.launches).toBe(true);
    expect(partialOverThreeMinutes.failureCode).toBeNull();

    const partialUnderThreeMinutes = classifyParticipant(
      baseInput({ liveStatus: 'stopped', capturedMs: 100_000, hadUnexpectedEnd: true }),
    );
    expect(partialUnderThreeMinutes.launches).toBe(false);
    expect(partialUnderThreeMinutes.failureCode).toBe('recording_too_short');
    expect(partialUnderThreeMinutes.retryable).toBe(false);
    expect(partialUnderThreeMinutes.requiresFallbackPlan).toBe(true);
    // The captured amount is still reported, even on a failure.
    expect(partialUnderThreeMinutes.capturedMs).toBe(100_000);

    const failedToStart = classifyParticipant(
      baseInput({ liveStatus: 'failed_to_start', capturedMs: 0, verifiedAudio: null }),
    );
    expect(failedToStart.recordingStatus).toBe('failed_to_start');
    expect(failedToStart.failureCode).toBe('recording_failed_to_start');
    expect(failedToStart.retryable).toBe(false);
    expect(failedToStart.requiresFallbackPlan).toBe(true);

    const noSegments = classifyParticipant(
      baseInput({
        liveStatus: 'not_started',
        assemblyAttempted: false,
        capturedMs: 0,
        verifiedAudio: null,
      }),
    );
    expect(noSegments.recordingStatus).toBe('missing');
    expect(noSegments.failureCode).toBe('recording_missing');
    expect(noSegments.retryable).toBe(true);

    const objectTooSmall = classifyParticipant(baseInput({ liveStatus: 'stopped', verifiedAudio: null }));
    expect(objectTooSmall.recordingStatus).toBe('missing');
    expect(objectTooSmall.failureCode).toBe('recording_missing');
    expect(objectTooSmall.retryable).toBe(true);

    const assemblyError = classifyParticipant(
      baseInput({ liveStatus: 'stopped', assemblyFailed: true, verifiedAudio: null }),
    );
    expect(assemblyError.recordingStatus).toBe('missing');
    expect(assemblyError.failureCode).toBe('recording_assembly_failed');
    expect(assemblyError.retryable).toBe(true);
  });

  it('reports_none_of_the_failure_fields_on_success', () => {
    const outcome = classifyParticipant(baseInput());
    expect(outcome.audioBytes).toBe(500_000);
    expect(outcome.audioDurationMs).toBe(300_000);
    expect(outcome.failureReason).toBeNull();
  });
});

describe('deriveLessonStatus', () => {
  const launched = (n: number): ParticipantClassification[] =>
    Array.from({ length: n }, () => ({ launches: true }) as ParticipantClassification);
  const failed = (n: number): ParticipantClassification[] =>
    Array.from({ length: n }, () => ({ launches: false }) as ParticipantClassification);

  it('derives_the_lesson_status_from_its_branches', () => {
    expect(deriveLessonStatus([], 170)).toBe('too_short');
    expect(deriveLessonStatus([...launched(2)], 600)).toBe('recorded');
    expect(deriveLessonStatus([...launched(1), ...failed(1)], 600)).toBe('recording_partial');
    expect(deriveLessonStatus([...failed(2)], 600)).toBe('recording_failed');
  });
});
