import type { WritingHighlightSegment } from '@english-quest/shared';

export interface HighlightableError {
  index: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Splits `text` at every error's start and end offset, so each resulting
 * segment is covered by exactly one set of errors (empty for plain text).
 * Overlapping errors share a segment (F17 spec §4). Concatenating the
 * segments' texts in order reproduces `text` exactly, since the boundaries
 * are a partition of `[0, text.length)`.
 */
export function highlightSegments(text: string, errors: readonly HighlightableError[]): WritingHighlightSegment[] {
  if (errors.length === 0) {
    return text.length > 0 ? [{ text, errorIndexes: [] }] : [];
  }

  const boundaries = new Set<number>([0, text.length]);
  for (const error of errors) {
    boundaries.add(error.startOffset);
    boundaries.add(error.endOffset);
  }
  const cuts = [...boundaries].sort((a, b) => a - b);

  const segments: WritingHighlightSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i]!;
    const end = cuts[i + 1]!;
    const covering = errors.filter((error) => error.startOffset <= start && error.endOffset >= end).map((error) => error.index);
    const segmentText = text.slice(start, end);
    const last = segments[segments.length - 1];
    if (last && sameIndexes(last.errorIndexes, covering)) {
      last.text += segmentText;
    } else if (segmentText.length > 0 || covering.length > 0) {
      segments.push({ text: segmentText, errorIndexes: covering });
    }
  }
  return segments;
}

function sameIndexes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
