import { describe, expect, it } from 'vitest';

import { planSegments, sliceReference, type RecognizedWord } from '../../src/speaking/scoring/segment-planner';
import { tokenizeDisplay } from '../../src/speaking/scoring/token-alignment';

const MAX_MS = 29_000;
const PADDING_MS = 300;

/** `count` words of `durationMs` each, back to back with `gapMs` of silence between them, starting at `startAt`. */
function evenlySpacedWords(count: number, options: { startAt?: number; durationMs?: number; gapMs?: number } = {}): RecognizedWord[] {
  const startAt = options.startAt ?? 0;
  const durationMs = options.durationMs ?? 300;
  const gapMs = options.gapMs ?? 200;
  const step = durationMs + gapMs;
  return Array.from({ length: count }, (_, i) => ({
    startMs: startAt + i * step,
    durationMs,
    text: `word${i}`,
  }));
}

describe('planSegments', () => {
  it('a_clip_within_the_cap_is_one_segment', () => {
    // 22 s of speech, well under the 29 s cap.
    const words = evenlySpacedWords(44, { durationMs: 300, gapMs: 200 }); // 44 * 500 = 22,000 ms span
    const durationMs = 23_000;

    const segments = planSegments({ durationMs, words, maxMs: MAX_MS, paddingMs: PADDING_MS });

    expect(segments).toHaveLength(1);
    expect(segments[0]!.startMs).toBe(Math.max(0, words[0]!.startMs - PADDING_MS));
    const last = words[words.length - 1]!;
    expect(segments[0]!.endMs).toBe(last.startMs + last.durationMs + PADDING_MS);
    expect(segments[0]!.wordIndexes).toEqual(words.map((_, i) => i));
  });

  it('a_long_clip_is_cut_at_word_gaps_under_the_cap', () => {
    // ~85 s of speech: far past the 29 s cap, so it must be split into several segments.
    const words = evenlySpacedWords(170, { durationMs: 300, gapMs: 200 }); // 170 * 500 = 85,000 ms span
    const durationMs = 86_000;

    const segments = planSegments({ durationMs, words, maxMs: MAX_MS, paddingMs: PADDING_MS });

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.endMs - segment.startMs).toBeLessThanOrEqual(MAX_MS);
    }
    // Contiguous, with no gap or overlap between consecutive segments.
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.startMs).toBe(segments[i - 1]!.endMs);
    }
    // Every word appears in exactly one segment, in order.
    const covered = segments.flatMap((segment) => segment.wordIndexes);
    expect(covered).toEqual(words.map((_, i) => i));
    // The first and last segments touch the padded speech span.
    expect(segments[0]!.startMs).toBe(Math.max(0, words[0]!.startMs - PADDING_MS));
    const last = words[words.length - 1]!;
    expect(segments[segments.length - 1]!.endMs).toBe(last.startMs + last.durationMs + PADDING_MS);
  });

  it('trims_leading_and_trailing_silence', () => {
    // 10 s of silence, then 20 s of speech, well inside a much longer recording.
    const words = evenlySpacedWords(40, { startAt: 10_000, durationMs: 300, gapMs: 200 }); // 40 * 500 = 20,000 ms
    const durationMs = 60_000;

    const segments = planSegments({ durationMs, words, maxMs: MAX_MS, paddingMs: PADDING_MS });

    expect(segments).toHaveLength(1);
    expect(segments[0]!.startMs).toBe(10_000 - PADDING_MS);
    const last = words[words.length - 1]!;
    expect(segments[0]!.endMs).toBe(last.startMs + last.durationMs + PADDING_MS);
    expect(segments[0]!.endMs).toBeLessThan(durationMs);
  });

  it('clamps_the_padded_span_to_the_file_when_a_word_starts_within_the_padding_of_either_edge', () => {
    const words: RecognizedWord[] = [{ startMs: 100, durationMs: 200, text: 'hi' }];
    const durationMs = 250;

    const segments = planSegments({ durationMs, words, maxMs: MAX_MS, paddingMs: PADDING_MS });

    expect(segments).toEqual([{ startMs: 0, endMs: 250, wordIndexes: [0] }]);
  });

  it('returns_no_segments_for_an_empty_word_list', () => {
    expect(planSegments({ durationMs: 5_000, words: [], maxMs: MAX_MS, paddingMs: PADDING_MS })).toEqual([]);
  });
});

describe('sliceReference', () => {
  it('reference_slices_are_contiguous_and_cover_every_token_once', () => {
    const passage = 'alpha beta gamma delta epsilon zeta';
    const referenceTokens = tokenizeDisplay(passage);
    // "delta" and "epsilon" were never recognized — an omission spanning a segment cut.
    const words: RecognizedWord[] = [
      { startMs: 0, durationMs: 300, text: 'alpha' },
      { startMs: 1_000, durationMs: 300, text: 'beta' },
      { startMs: 2_000, durationMs: 300, text: 'gamma' },
      { startMs: 3_000, durationMs: 300, text: 'zeta' },
    ];
    const segments = [
      { startMs: 0, endMs: 1_500, wordIndexes: [0, 1] },
      { startMs: 1_500, endMs: 3_500, wordIndexes: [2, 3] },
    ];

    const slices = sliceReference(referenceTokens, words, segments);

    expect(slices).toEqual(['alpha beta', 'gamma delta epsilon zeta']);
    expect(slices.join(' ')).toBe(passage);
  });

  it('a_segment_with_an_empty_slice_is_skipped', () => {
    const referenceTokens = tokenizeDisplay('alpha beta gamma delta');
    // "xyz" in the middle segment has no counterpart in the passage at all.
    const words: RecognizedWord[] = [
      { startMs: 0, durationMs: 300, text: 'alpha' },
      { startMs: 1_000, durationMs: 300, text: 'xyz' },
      { startMs: 2_000, durationMs: 300, text: 'beta' },
      { startMs: 2_500, durationMs: 300, text: 'gamma' },
      { startMs: 3_000, durationMs: 300, text: 'delta' },
    ];
    const segments = [
      { startMs: 0, endMs: 1_000, wordIndexes: [0] },
      { startMs: 1_000, endMs: 2_000, wordIndexes: [1] },
      { startMs: 2_000, endMs: 3_500, wordIndexes: [2, 3, 4] },
    ];

    const slices = sliceReference(referenceTokens, words, segments);

    expect(slices).toEqual(['alpha', '', 'beta gamma delta']);
  });

  it('trailing_unaligned_tokens_join_the_last_segment', () => {
    const referenceTokens = tokenizeDisplay('alpha beta unrecognized');
    const words: RecognizedWord[] = [
      { startMs: 0, durationMs: 300, text: 'alpha' },
      { startMs: 1_000, durationMs: 300, text: 'beta' },
    ];
    const segments = [{ startMs: 0, endMs: 1_500, wordIndexes: [0, 1] }];

    expect(sliceReference(referenceTokens, words, segments)).toEqual(['alpha beta unrecognized']);
  });
});
