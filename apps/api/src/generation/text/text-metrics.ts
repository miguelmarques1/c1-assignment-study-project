import type { LoadedFrequencyList } from './frequency-list';

/**
 * Deterministic text measurement for the difficulty gate (spec decision
 * A19). Every rule here decides a number a curator may want to reproduce by
 * hand, so each one is spelled out rather than left to a library.
 */

/** A run of letters or digits, with internal apostrophes, hyphens or dots: `don't`, `well-known`, `3.5`. */
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

/** A period after one of these does not end a sentence. Compared lowercase, without the period. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'no', 'jr', 'sr', 'mt', 'inc', 'ltd', 'co', 'approx', 'cf',
]);

/**
 * Terminal punctuation, optional closing quotes or brackets, whitespace, and
 * then something that can open a sentence: an uppercase letter or a digit,
 * possibly behind an opening quote or bracket.
 */
const SENTENCE_BOUNDARY = /([.!?…]+)(["'”’)\]]*)\s+(?=["'“‘([]?[\p{Lu}\p{N}])/gu;

const LAST_WORD = /([\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*)$/u;

/** `n't` stems that are not the verb itself. */
const NEGATIVE_STEMS: Record<string, string> = { wo: 'will', ca: 'can', sha: 'shall', ai: 'be' };

export interface FrequencyBands {
  /** Ranks 1–1,000. */
  k1: number;
  k2: number;
  k3: number;
  /** Ranks 3,001–5,000. */
  k4_5: number;
  /** Not in the list at all. */
  off_list: number;
}

export interface TextMeasurement {
  wordCount: number;
  sentenceCount: number;
  meanSentenceLength: number;
  typeTokenRatio: number;
  /** Share of counted words ranked beyond the cutoff, or absent from the list. */
  outOfFrequencyRatio: number;
  /** How many words the frequency measures counted, after the exclusions. */
  frequencyCounted: number;
  frequencyBands: FrequencyBands;
}

/** NFKC, straight quotes, plain hyphens, lowercase, single spaces. Both sides of every verbatim comparison go through this. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** `normalizeForMatch`, then without leading or trailing punctuation: how a model-supplied quote is located in the text. */
export function normalizeQuote(text: string): string {
  return normalizeForMatch(text).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function words(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

function hasWord(text: string): boolean {
  return words(text).length > 0;
}

/** Whether a period right after `before` belongs to an abbreviation or an initial rather than ending the sentence. */
function isNonTerminalPeriod(before: string): boolean {
  const last = LAST_WORD.exec(before)?.[1];
  if (!last) {
    return false;
  }
  if (ABBREVIATIONS.has(last.toLowerCase())) {
    return true;
  }
  // A single capital is an initial (`J. K. Rowling`), except the pronoun.
  return /^\p{Lu}$/u.test(last) && last !== 'I';
}

/**
 * Sentences, in order. A paragraph break (a blank line) always ends one, so
 * a heading-like line without a period still counts as a sentence of its own.
 */
export function sentences(text: string): string[] {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const flat = paragraph.replace(/\s+/g, ' ').trim();
    if (!flat) {
      continue;
    }
    let start = 0;
    for (const match of flat.matchAll(SENTENCE_BOUNDARY)) {
      const terminator = match[1] ?? '';
      if (terminator === '.' && isNonTerminalPeriod(flat.slice(start, match.index))) {
        continue;
      }
      const end = match.index + terminator.length + (match[2] ?? '').length;
      const sentence = flat.slice(start, end).trim();
      if (hasWord(sentence)) {
        result.push(sentence);
      }
      start = match.index + match[0].length;
    }
    const rest = flat.slice(start).trim();
    if (hasWord(rest)) {
      result.push(rest);
    }
  }
  return result;
}

/** The form a lowercase word is looked up under: a contraction by its stem (`don't` → `do`, `won't` → `will`, `it's` → `it`). */
export function lookupStem(lower: string): string {
  const negative = /^(.+)n't$/.exec(lower);
  if (negative?.[1]) {
    return NEGATIVE_STEMS[negative[1]] ?? negative[1];
  }
  const clitic = /^(.+)'(?:s|re|ve|ll|d|m)$/.exec(lower);
  return clitic?.[1] ?? lower;
}

/** A hyphenated compound is in the list only when every part is, at the rank of its rarest part. */
function rankOfStem(stem: string, list: LoadedFrequencyList): number | undefined {
  let worst = 0;
  for (const part of stem.split('-')) {
    const rank = list.rankOf(part);
    if (rank === undefined) {
      return undefined;
    }
    worst = Math.max(worst, rank);
  }
  return worst;
}

function isAlphabetic(token: string): boolean {
  return /\p{L}/u.test(token) && !/\p{N}/u.test(token);
}

/** Two or more letters, all capitals: `NATO`, `UK`. Excluded from the frequency measures. */
function isAcronym(token: string): boolean {
  return token.length >= 2 && token === token.toUpperCase() && token !== token.toLowerCase();
}

function band(rank: number | undefined): keyof FrequencyBands {
  if (rank === undefined || rank > 5000) {
    return 'off_list';
  }
  if (rank <= 1000) {
    return 'k1';
  }
  if (rank <= 2000) {
    return 'k2';
  }
  return rank <= 3000 ? 'k3' : 'k4_5';
}

/**
 * Every measure the gate reads, over one text. Word count includes numbers.
 * TTR and the frequency measures read alphabetic words only. The frequency
 * measures also skip acronyms, dotted abbreviations (`U.S`, `e.g`) and
 * capitalised words mid-sentence that the list does not know (names), so a
 * text cannot reach its lexical threshold on proper nouns.
 */
export function measureText(text: string, list: LoadedFrequencyList, cutoff: number): TextMeasurement {
  const bandCounts: FrequencyBands = { k1: 0, k2: 0, k3: 0, k4_5: 0, off_list: 0 };
  const types = new Set<string>();
  let wordCount = 0;
  let alphabeticCount = 0;
  let counted = 0;
  let beyondCutoff = 0;

  const allSentences = sentences(text);
  for (const sentence of allSentences) {
    words(sentence).forEach((token, index) => {
      wordCount += 1;
      if (!isAlphabetic(token)) {
        return;
      }
      const lower = token.replace(/’/g, "'").toLowerCase();
      alphabeticCount += 1;
      types.add(lower);

      if (isAcronym(token) || lower.includes('.')) {
        return;
      }
      const rank = rankOfStem(lookupStem(lower), list);
      const capitalisedMidSentence = index > 0 && /^\p{Lu}/u.test(token);
      if (capitalisedMidSentence && rank === undefined) {
        return;
      }
      counted += 1;
      bandCounts[band(rank)] += 1;
      if (rank === undefined || rank > cutoff) {
        beyondCutoff += 1;
      }
    });
  }

  const share = (value: number): number => (counted === 0 ? 0 : value / counted);
  return {
    wordCount,
    sentenceCount: allSentences.length,
    meanSentenceLength: allSentences.length === 0 ? 0 : wordCount / allSentences.length,
    typeTokenRatio: alphabeticCount === 0 ? 0 : types.size / alphabeticCount,
    outOfFrequencyRatio: share(beyondCutoff),
    frequencyCounted: counted,
    frequencyBands: {
      k1: share(bandCounts.k1),
      k2: share(bandCounts.k2),
      k3: share(bandCounts.k3),
      k4_5: share(bandCounts.k4_5),
      off_list: share(bandCounts.off_list),
    },
  };
}
