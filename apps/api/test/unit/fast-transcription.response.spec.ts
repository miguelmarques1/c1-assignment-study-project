import { describe, expect, it } from 'vitest';

import { parseFastTranscription } from '../../src/speech/fast-transcription.response';
import { SpeechServiceError } from '../../src/speech/speech-errors';

function phrase(offset: number, duration: number, text: string, extra: Record<string, unknown> = {}) {
  return { offsetMilliseconds: offset, durationMilliseconds: duration, text, ...extra };
}

describe('parseFastTranscription', () => {
  it('maps_phrases_to_ordered_utterances', () => {
    const result = parseFastTranscription({
      durationMilliseconds: 12_345.6,
      phrases: [phrase(9_000, 2_000, 'Third.'), phrase(720, 480, 'First.'), phrase(3_280, 640, 'Second.')],
    });

    expect(result.audioDurationMs).toBe(12_346);
    expect(result.utterances.map((utterance) => [utterance.idx, utterance.text])).toEqual([
      [0, 'First.'],
      [1, 'Second.'],
      [2, 'Third.'],
    ]);
    expect(result.utterances[0]).toMatchObject({ startMs: 720, endMs: 1_200 });
    expect(result.utterances[2]).toMatchObject({ startMs: 9_000, endMs: 11_000 });
  });

  it('drops_phrases_with_no_text', () => {
    const result = parseFastTranscription({
      phrases: [phrase(0, 500, '   '), phrase(1_000, 800, 'Hello there.')],
    });

    expect(result.utterances).toHaveLength(1);
    expect(result.utterances[0]).toMatchObject({ idx: 0, text: 'Hello there.' });
  });

  it('words_carry_timing_and_null_confidence', () => {
    const result = parseFastTranscription({
      phrases: [
        phrase(1_200, 1_040, 'Thank you.', {
          confidence: 0.93,
          words: [
            { text: 'Thank', offsetMilliseconds: 1_200, durationMilliseconds: 200 },
            { text: 'you.', offsetMilliseconds: 1_400, durationMilliseconds: 840 },
          ],
        }),
      ],
    });

    expect(result.utterances[0]!.words).toEqual([
      { text: 'Thank', startMs: 1_200, durationMs: 200, confidence: null },
      { text: 'you.', startMs: 1_400, durationMs: 840, confidence: null },
    ]);
  });

  it('keeps_phrase_confidence_on_the_utterance', () => {
    const result = parseFastTranscription({
      phrases: [phrase(0, 500, 'Yes.', { confidence: 0.93616915 }), phrase(600, 500, 'No.')],
    });

    expect(result.utterances[0]!.confidence).toBeCloseTo(0.93616915, 6);
    expect(result.utterances[1]!.confidence).toBeNull();
  });

  it('a_response_without_phrases_yields_no_utterances', () => {
    const result = parseFastTranscription({ durationMilliseconds: 200_000, phrases: [] });

    expect(result.utterances).toEqual([]);
  });

  it('rejects_a_malformed_response', () => {
    expect(() => parseFastTranscription({ combinedPhrases: [] })).toThrow(SpeechServiceError);
    expect(() => parseFastTranscription({ phrases: [{ text: 'no timing' }] })).toThrow(SpeechServiceError);
  });
});
