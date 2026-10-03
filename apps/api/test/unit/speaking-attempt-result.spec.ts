import { describe, expect, it } from 'vitest';

import {
  displayWords,
  failingPhonemes,
  mergeSegments,
  recognizedWordCount,
  type MergedWord,
  type SegmentResult,
} from '../../src/speaking/scoring/attempt-result';
import { tokenizeDisplay } from '../../src/speaking/scoring/token-alignment';
import type { MappedWord } from '../../src/speech/pronunciation-assessment.response';

function word(overrides: Partial<MappedWord> & { word: string }): MappedWord {
  return { accuracy: 90, errorTypes: [], offsetMs: 0, durationMs: 300, phonemes: [], ...overrides };
}

const FULL_SCORES = { pronunciation: 80, accuracy: 80, fluency: 80, prosody: 80, completeness: 80 };

describe('mergeSegments', () => {
  it('merges_segment_words_into_recording_time', () => {
    const segments: SegmentResult[] = [
      { startMs: 0, durationMs: 10_000, scores: FULL_SCORES, words: [word({ word: 'one', offsetMs: 100 })] },
      { startMs: 10_000, durationMs: 10_000, scores: FULL_SCORES, words: [word({ word: 'two', offsetMs: 200 })] },
    ];

    const merged = mergeSegments(segments);

    expect(merged.words.map((w) => [w.word, w.startMs])).toEqual([
      ['one', 100],
      ['two', 10_200],
    ]);
  });

  it('scores_are_duration_weighted_like_f10', () => {
    const segments: SegmentResult[] = [
      { startMs: 0, durationMs: 10_000, scores: { pronunciation: 90, accuracy: 90, fluency: 90, prosody: 90, completeness: 90 }, words: [] },
      { startMs: 10_000, durationMs: 20_000, scores: { pronunciation: 60, accuracy: 60, fluency: 60, prosody: 60, completeness: 60 }, words: [] },
    ];

    const merged = mergeSegments(segments);

    // (90*10000 + 60*20000) / 30000 = 70
    expect(merged.scores.pronunciation).toBeCloseTo(70);
    expect(merged.scores.prosody).toBeCloseTo(70);
  });

  it('prosody_is_weighted_over_segments_that_report_it', () => {
    const segments: SegmentResult[] = [
      { startMs: 0, durationMs: 10_000, scores: { pronunciation: 80, accuracy: 80, fluency: 80, prosody: 90, completeness: 80 }, words: [] },
      { startMs: 10_000, durationMs: 10_000, scores: { pronunciation: 80, accuracy: 80, fluency: 80, prosody: null, completeness: 80 }, words: [] },
      { startMs: 20_000, durationMs: 10_000, scores: { pronunciation: 80, accuracy: 80, fluency: 80, prosody: 70, completeness: 80 }, words: [] },
    ];

    const merged = mergeSegments(segments);

    // prosody: mean of 90 and 70 only, ignoring the null segment.
    expect(merged.scores.prosody).toBeCloseTo(80);
    // the other scores still weight over all three segments.
    expect(merged.scores.pronunciation).toBeCloseTo(80);
  });
});

describe('failingPhonemes', () => {
  it('failing_phonemes_group_by_tag_below_sixty_excluding_omissions', () => {
    const words: MergedWord[] = [
      { word: 'nothing', accuracy: 40, errorTypes: [], startMs: 0, durationMs: 300, phonemes: [{ phoneme: 'θ', accuracy: 40, offsetMs: 0, durationMs: 80 }] },
      { word: 'thought', accuracy: 50, errorTypes: [], startMs: 500, durationMs: 300, phonemes: [{ phoneme: 'θ', accuracy: 20, offsetMs: 0, durationMs: 80 }] },
      { word: 'this', accuracy: 90, errorTypes: [], startMs: 800, durationMs: 200, phonemes: [{ phoneme: 'ð', accuracy: 90, offsetMs: 0, durationMs: 80 }] },
      // An omission still carries phonemes structurally (F10 zeroes them), but must be excluded entirely.
      { word: 'the', accuracy: 0, errorTypes: ['Omission'], startMs: 0, durationMs: 0, phonemes: [{ phoneme: 'ð', accuracy: 0, offsetMs: 0, durationMs: 0 }] },
    ];

    const groups = failingPhonemes(words);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.tag).toBe('phoneme:/θ/');
    expect(groups[0]!.instances).toBe(2);
    expect(groups[0]!.meanAccuracy).toBeCloseTo(30);
    // Worst instance (accuracy 20, "thought") sorts first.
    expect(groups[0]!.examples[0]!.word).toBe('thought');
    expect(groups[0]!.examples[0]!.accuracy).toBe(20);
  });

  it('ranks_worse_mean_accuracy_first', () => {
    const words: MergedWord[] = [
      { word: 'a', accuracy: 55, errorTypes: [], startMs: 0, durationMs: 100, phonemes: [{ phoneme: 'p', accuracy: 55, offsetMs: 0, durationMs: 50 }] },
      { word: 'b', accuracy: 20, errorTypes: [], startMs: 200, durationMs: 100, phonemes: [{ phoneme: 'b', accuracy: 20, offsetMs: 0, durationMs: 50 }] },
    ];

    const groups = failingPhonemes(words);

    expect(groups.map((g) => g.tag)).toEqual(['phoneme:/b/', 'phoneme:/p/']);
  });
});

describe('displayWords', () => {
  it('display_words_keep_the_passages_punctuation_and_casing', () => {
    const tokens = tokenizeDisplay('Nothing, in the valley.');
    const assessed: MergedWord[] = [
      { word: 'nothing', accuracy: 48, errorTypes: ['Mispronunciation'], startMs: 640, durationMs: 410, phonemes: [] },
      { word: 'in', accuracy: 96, errorTypes: [], startMs: 1_050, durationMs: 120, phonemes: [] },
      { word: 'the', accuracy: 90, errorTypes: [], startMs: 1_200, durationMs: 100, phonemes: [] },
      { word: 'valley', accuracy: 88, errorTypes: [], startMs: 1_400, durationMs: 200, phonemes: [] },
    ];

    const words = displayWords(tokens, assessed);

    expect(words[0]).toEqual({ text: 'Nothing,', band: 'poor', accuracy: 48, errorTypes: ['Mispronunciation'], startMs: 640, durationMs: 410 });
    expect(words[3]).toMatchObject({ text: 'valley.', band: 'good', accuracy: 88 });
  });

  it('insertions_are_hidden_and_omissions_show_as_poor_without_offsets', () => {
    const tokens = tokenizeDisplay('the cat sat');
    const assessed: MergedWord[] = [
      { word: 'the', accuracy: 0, errorTypes: ['Omission'], startMs: 0, durationMs: 0, phonemes: [] },
      { word: 'um', accuracy: 70, errorTypes: ['Insertion'], startMs: 100, durationMs: 100, phonemes: [] },
      { word: 'cat', accuracy: 85, errorTypes: [], startMs: 300, durationMs: 200, phonemes: [] },
      { word: 'sat', accuracy: 91, errorTypes: [], startMs: 600, durationMs: 200, phonemes: [] },
    ];

    const words = displayWords(tokens, assessed);

    expect(words).toHaveLength(3);
    expect(words[0]).toEqual({ text: 'the', band: 'poor', accuracy: 0, errorTypes: ['Omission'], startMs: null, durationMs: null });
    expect(words[1]).toMatchObject({ text: 'cat', band: 'good', accuracy: 85 });
  });

  it('an_unmatched_display_token_has_no_band', () => {
    const tokens = tokenizeDisplay('three items');
    const assessed: MergedWord[] = [{ word: 'items', accuracy: 90, errorTypes: [], startMs: 0, durationMs: 200, phonemes: [] }];

    const words = displayWords(tokens, assessed);

    expect(words[0]).toEqual({ text: 'three', band: null, accuracy: null, errorTypes: [], startMs: null, durationMs: null });
    expect(words[1]).toMatchObject({ text: 'items', band: 'good' });
  });
});

describe('recognizedWordCount', () => {
  it('recognized_words_count_non_omitted_words_on_a_direct_read_aloud', () => {
    const assessed: MergedWord[] = Array.from({ length: 12 }, (_, i) => ({
      word: `w${i}`,
      accuracy: i < 3 ? 0 : 80,
      errorTypes: i < 3 ? ['Omission'] : [],
      startMs: i * 100,
      durationMs: 80,
      phonemes: [],
    }));

    expect(recognizedWordCount(null, assessed)).toBe(9);
  });

  it('uses_the_transcription_count_when_the_recording_was_transcribed', () => {
    const assessed: MergedWord[] = [{ word: 'a', accuracy: 90, errorTypes: [], startMs: 0, durationMs: 100, phonemes: [] }];

    expect(recognizedWordCount(25, assessed)).toBe(25);
  });
});
