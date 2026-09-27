import type { ModelOccurrence, OccurrenceRejection, TagOccurrenceReport } from '../generation.contract';
import { normalizeForMatch, normalizeQuote, words } from '../text/text-metrics';

/** An occurrence quote needs this many words to identify a structure, and no more than this to stay one (spec A21). */
const MIN_OCCURRENCE_WORDS = 2;
const MAX_OCCURRENCE_WORDS = 40;

const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/** Every start index of `needle` in `haystack` where it is a whole-word match. */
export function wholeWordPositions(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  if (!needle) {
    return positions;
  }
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) {
      return positions;
    }
    const before = haystack[index - 1];
    const after = haystack[index + needle.length];
    const startsWord = before === undefined || !ALPHANUMERIC.test(before) || !ALPHANUMERIC.test(needle[0] ?? '');
    const endsWord = after === undefined || !ALPHANUMERIC.test(after) || !ALPHANUMERIC.test(needle.at(-1) ?? '');
    if (startsWord && endsWord) {
      positions.push(index);
    }
    from = index + 1;
  }
}

/** Whether `needle` appears in `haystack` as whole words. Both are expected normalised. */
export function containsWholeWords(haystack: string, needle: string): boolean {
  return wholeWordPositions(haystack, needle).length > 0;
}

function overlaps(start: number, end: number, spans: ReadonlyArray<[number, number]>): boolean {
  return spans.some(([spanStart, spanEnd]) => start < spanEnd && spanStart < end);
}

/**
 * The hybrid target-structure check (spec §1, interview decision). For each
 * required tag, the model's quotes are located verbatim in the body, counted
 * once each and never overlapping another counted quote of the same tag,
 * and, when the tag has markers, required to match one. Occurrences of
 * tags that were not required are ignored. Pure.
 */
export function verifyTargetStructures(
  body: string,
  requiredTags: readonly string[],
  occurrences: readonly ModelOccurrence[],
  markers: ReadonlyMap<string, RegExp[]>,
): Record<string, TagOccurrenceReport> {
  const haystack = normalizeForMatch(body);
  const thirdLength = haystack.length / 3;
  const report: Record<string, TagOccurrenceReport> = {};

  for (const tag of requiredTags) {
    const spans: Array<[number, number]> = [];
    const thirds = new Set<number>();
    const rejected: TagOccurrenceReport['rejected'] = [];
    const tagMarkers = markers.get(tag) ?? [];

    for (const occurrence of occurrences) {
      if (occurrence.tag !== tag) {
        continue;
      }
      const reject = (reason: OccurrenceRejection): void => {
        rejected.push({ quote: occurrence.quote, reason });
      };
      const needle = normalizeQuote(occurrence.quote);
      const wordCount = words(needle).length;
      if (wordCount < MIN_OCCURRENCE_WORDS) {
        reject('too short');
        continue;
      }
      if (wordCount > MAX_OCCURRENCE_WORDS) {
        reject('too long');
        continue;
      }
      // Markers read the quote with its own punctuation: a question mark is the question-form marker.
      const markerText = normalizeForMatch(occurrence.quote);
      if (tagMarkers.length > 0 && !tagMarkers.some((marker) => marker.test(markerText))) {
        reject('no marker match');
        continue;
      }
      const positions = wholeWordPositions(haystack, needle);
      if (positions.length === 0) {
        reject('not in the text');
        continue;
      }
      const start = positions.find((position) => !overlaps(position, position + needle.length, spans));
      if (start === undefined) {
        reject('overlaps another occurrence');
        continue;
      }
      spans.push([start, start + needle.length]);
      thirds.add(Math.min(3, Math.floor(start / thirdLength) + 1));
    }

    report[tag] = { occurrences: spans.length, thirds: [...thirds].sort((a, b) => a - b), rejected };
  }
  return report;
}
