import { normalizeToken } from '../../excerpts/excerpt-tokens';
import { alignTokens, type DisplayToken } from './token-alignment';

export interface TimedWord {
  startMs: number;
  durationMs: number;
}

export interface RecognizedWord extends TimedWord {
  text: string;
}

export interface PlannedSegment {
  startMs: number;
  endMs: number;
  /** Indexes into the `words` array this segment covers, in order. */
  wordIndexes: number[];
}

function wordEnd(word: TimedWord): number {
  return word.startMs + word.durationMs;
}

function rangeFrom(start: number, endExclusive: number): number[] {
  return Array.from({ length: Math.max(0, endExclusive - start) }, (_, i) => start + i);
}

/**
 * Trims silence to the padded speech span, then cuts a span longer than
 * `maxMs` at the latest word gap's midpoint that keeps every segment at or
 * under the cap (A5). Each word belongs to the segment holding its
 * midpoint, which cutting exactly at a gap's midpoint gives for free: a
 * word's own midpoint always falls on the side of the cut its full
 * duration does. Assumes `words` is non-empty and sorted by `startMs`.
 */
export function planSegments(input: {
  durationMs: number;
  words: readonly TimedWord[];
  maxMs: number;
  paddingMs: number;
}): PlannedSegment[] {
  const { durationMs, words, maxMs, paddingMs } = input;
  if (words.length === 0) {
    return [];
  }

  const speechStart = Math.max(0, words[0]!.startMs - paddingMs);
  const speechEnd = Math.min(durationMs, wordEnd(words[words.length - 1]!) + paddingMs);

  if (speechEnd - speechStart <= maxMs) {
    return [{ startMs: speechStart, endMs: speechEnd, wordIndexes: rangeFrom(0, words.length) }];
  }

  // gapMidpoints[k] is the boundary between words[k] and words[k + 1].
  const gapMidpoints: number[] = [];
  for (let i = 1; i < words.length; i++) {
    gapMidpoints.push((wordEnd(words[i - 1]!) + words[i]!.startMs) / 2);
  }

  const segments: PlannedSegment[] = [];
  let segmentStart = speechStart;
  let wordCursor = 0;

  while (segmentStart < speechEnd) {
    const limit = segmentStart + maxMs;
    if (limit >= speechEnd) {
      segments.push({ startMs: segmentStart, endMs: speechEnd, wordIndexes: rangeFrom(wordCursor, words.length) });
      break;
    }

    let cutGapIndex = -1;
    for (let k = wordCursor; k < gapMidpoints.length; k++) {
      if (gapMidpoints[k]! <= limit) {
        cutGapIndex = k;
      } else {
        break;
      }
    }
    if (cutGapIndex === -1) {
      // No gap fits under the cap (a single word's span alone exceeds it) — take that one word to make progress.
      cutGapIndex = wordCursor;
    }

    const isFinalWord = cutGapIndex >= gapMidpoints.length;
    const cutMs = isFinalWord ? speechEnd : gapMidpoints[cutGapIndex]!;
    const endIndexExclusive = isFinalWord ? words.length : cutGapIndex + 1;

    segments.push({ startMs: segmentStart, endMs: cutMs, wordIndexes: rangeFrom(wordCursor, endIndexExclusive) });
    segmentStart = cutMs;
    wordCursor = endIndexExclusive;
  }

  return segments;
}

/**
 * Splits a read-aloud passage's display tokens into one contiguous slice per
 * segment, aligned through the transcribed words used to plan them (A6). A
 * passage token not aligned to any transcribed word joins the segment of
 * the next aligned token, or the last segment when it is trailing. The
 * concatenation of every slice, in segment order, reproduces the passage
 * exactly once. A segment with nothing aligned to it gets an empty slice —
 * the scorer's signal to skip assessing it.
 */
export function sliceReference(
  referenceTokens: readonly DisplayToken[],
  words: readonly RecognizedWord[],
  segments: readonly PlannedSegment[],
): string[] {
  const wordSegment = new Array<number>(words.length).fill(-1);
  segments.forEach((segment, segmentIndex) => {
    for (const wordIndex of segment.wordIndexes) {
      wordSegment[wordIndex] = segmentIndex;
    }
  });

  const pairs = alignTokens(
    referenceTokens.map((token) => token.normalized),
    words.map((word) => normalizeToken(word.text)),
  );

  const tokenSegment = new Array<number>(referenceTokens.length).fill(-1);
  for (const { aIndex, bIndex } of pairs) {
    tokenSegment[aIndex] = wordSegment[bIndex]!;
  }

  const lastSegmentIndex = segments.length - 1;
  for (let i = referenceTokens.length - 1; i >= 0; i--) {
    if (tokenSegment[i] === -1) {
      tokenSegment[i] = i + 1 < referenceTokens.length ? tokenSegment[i + 1]! : lastSegmentIndex;
    }
  }

  const slices = segments.map(() => '');
  referenceTokens.forEach((token, i) => {
    const segmentIndex = tokenSegment[i]!;
    slices[segmentIndex] = slices[segmentIndex] ? `${slices[segmentIndex]} ${token.text}` : token.text;
  });
  return slices;
}
