import { describe, expect, it } from 'vitest';

import { parsePronunciationAssessment } from '../../src/speech/pronunciation-assessment.response';
import { SpeechNoRecognitionError, SpeechServiceError } from '../../src/speech/speech-errors';

function bodyWith(overrides: Record<string, unknown> = {}) {
  return {
    RecognitionStatus: 'Success',
    DisplayText: 'Hello there.',
    NBest: [
      {
        Display: 'Hello there.',
        AccuracyScore: 81.2,
        FluencyScore: 74.9,
        ProsodyScore: 69.3,
        CompletenessScore: 96.1,
        PronScore: 78.4,
        Words: [],
        ...overrides,
      },
    ],
  };
}

describe('parsePronunciationAssessment', () => {
  it('reads_the_five_scores_from_the_best_result', () => {
    const result = parsePronunciationAssessment(bodyWith());

    expect(result.scores).toEqual({
      pronunciation: 78.4,
      accuracy: 81.2,
      fluency: 74.9,
      prosody: 69.3,
      completeness: 96.1,
    });
  });

  it('maps_words_with_error_types_and_phonemes', () => {
    const result = parsePronunciationAssessment(
      bodyWith({
        Words: [
          {
            Word: 'thoroughly',
            Offset: 900_000,
            Duration: 2_100_000,
            AccuracyScore: 38.0,
            ErrorType: 'Mispronunciation',
            Phonemes: [{ Phoneme: 'θ', Offset: 900_000, Duration: 500_000, AccuracyScore: 41.5 }],
          },
        ],
      }),
    );

    expect(result.words).toEqual([
      {
        word: 'thoroughly',
        accuracy: 38.0,
        errorTypes: ['Mispronunciation'],
        offsetMs: 90,
        durationMs: 210,
        phonemes: [{ phoneme: 'θ', accuracy: 41.5, offsetMs: 90, durationMs: 50 }],
      },
    ]);
  });

  it('merges_prosody_feedback_into_error_types', () => {
    const result = parsePronunciationAssessment(
      bodyWith({
        Words: [
          {
            Word: 'well',
            Offset: 0,
            Duration: 100_000,
            AccuracyScore: 90,
            ErrorType: 'None',
            Feedback: {
              Prosody: {
                Break: { ErrorTypes: ['MissingBreak'] },
                Intonation: { ErrorTypes: ['Monotone'] },
              },
            },
          },
        ],
      }),
    );

    expect(result.words[0]!.errorTypes).toEqual(['MissingBreak', 'Monotone']);
    expect(result.words[0]!.errorTypes).not.toContain('None');
  });

  it('keeps_omission_and_insertion_words', () => {
    const result = parsePronunciationAssessment(
      bodyWith({
        Words: [
          { Word: 'actually', Offset: 0, Duration: 0, AccuracyScore: 0, ErrorType: 'Omission' },
          { Word: 'um', Offset: 0, Duration: 100_000, AccuracyScore: 50, ErrorType: 'Insertion' },
        ],
      }),
    );

    expect(result.words.map((word) => ({ word: word.word, errorTypes: word.errorTypes }))).toEqual([
      { word: 'actually', errorTypes: ['Omission'] },
      { word: 'um', errorTypes: ['Insertion'] },
    ]);
  });

  it('turns_ticks_into_clip_relative_ms', () => {
    const result = parsePronunciationAssessment(
      bodyWith({
        Words: [{ Word: 'hi', Offset: 7_500_000, Duration: 1_000_000, AccuracyScore: 90, ErrorType: 'None' }],
      }),
    );

    expect(result.words[0]!.offsetMs).toBe(750);
    expect(result.words[0]!.durationMs).toBe(100);
  });

  it('prosody_absent_maps_to_null', () => {
    const body = bodyWith();
    delete (body.NBest[0] as { ProsodyScore?: unknown }).ProsodyScore;

    const result = parsePronunciationAssessment(body);

    expect(result.scores.prosody).toBeNull();
  });

  it('rejects_a_malformed_result', () => {
    expect(() => parsePronunciationAssessment({ RecognitionStatus: 'Success' })).toThrow(SpeechServiceError);
    expect(() => parsePronunciationAssessment({ not: 'even close' })).toThrow(SpeechServiceError);
  });

  it('a_status_other_than_success_raises_no_recognition', () => {
    expect(() => parsePronunciationAssessment({ RecognitionStatus: 'NoMatch' })).toThrow(SpeechNoRecognitionError);
  });
});
