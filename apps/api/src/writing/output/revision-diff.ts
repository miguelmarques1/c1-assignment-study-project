import type { WritingRevisionSegment } from '@english-quest/shared';

import { matchKey } from '../../analysis/correction-diff';

interface Atom {
  text: string;
  isWord: boolean;
}

/** A word per A19 (letters/digits with one internal apostrophe or hyphen), or a single other character — glue that carries whitespace and punctuation through untouched. */
const WORD_TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/uy;

function tokenize(text: string): Atom[] {
  const atoms: Atom[] = [];
  let i = 0;
  while (i < text.length) {
    WORD_TOKEN.lastIndex = i;
    const match = WORD_TOKEN.exec(text);
    if (match && match.index === i) {
      atoms.push({ text: match[0], isWord: true });
      i += match[0].length;
    } else {
      atoms.push({ text: text[i]!, isWord: false });
      i += 1;
    }
  }
  return atoms;
}

/** Which words of `to` belong to the longest common subsequence against `from` (by `matchKey`), mirroring `correction-diff.ts`'s own DP. */
function longestCommonSubsequenceKept(from: readonly string[], to: readonly string[]): boolean[] {
  const fromKeys = from.map(matchKey);
  const toKeys = to.map(matchKey);
  const lengths: number[][] = Array.from({ length: from.length + 1 }, () => new Array<number>(to.length + 1).fill(0));
  for (let i = from.length - 1; i >= 0; i--) {
    for (let j = to.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        fromKeys[i] === toKeys[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const kept = new Array<boolean>(to.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < from.length && j < to.length) {
    if (fromKeys[i] === toKeys[j]) {
      kept[j] = true;
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return kept;
}

/**
 * Splits the revised text into spans a client emphasizes against the
 * original (A24): a word-level LCS against the original, using the same
 * `matchKey` as a lesson's correction segments, so a case- or
 * punctuation-only difference is not "changed". Whitespace and paragraph
 * breaks are exact substrings of the revised text (never re-joined with a
 * single space), and each one takes the `changed` flag of the word before
 * it — or, at the very start of the text, of the first word — so a run of
 * changed words keeps its interior spacing in one segment. Concatenating
 * the segments' texts reproduces the revised text exactly.
 */
export function revisionSegments(original: string, revised: string): WritingRevisionSegment[] {
  const originalWords = tokenize(original)
    .filter((atom) => atom.isWord)
    .map((atom) => atom.text);
  const revisedAtoms = tokenize(revised);
  const revisedWordIndexes = revisedAtoms.flatMap((atom, index) => (atom.isWord ? [index] : []));
  const kept = longestCommonSubsequenceKept(
    originalWords,
    revisedWordIndexes.map((index) => revisedAtoms[index]!.text),
  );

  const changedByAtomIndex = new Array<boolean | null>(revisedAtoms.length).fill(null);
  revisedWordIndexes.forEach((atomIndex, wordIndex) => {
    changedByAtomIndex[atomIndex] = !kept[wordIndex];
  });

  let lastKnown: boolean | null = null;
  for (let i = 0; i < changedByAtomIndex.length; i++) {
    if (changedByAtomIndex[i] === null) {
      changedByAtomIndex[i] = lastKnown;
    } else {
      lastKnown = changedByAtomIndex[i]!;
    }
  }
  // Leading glue before the first word has no preceding flag yet — back-fill from the first known one.
  let firstKnown: boolean = false;
  for (const value of changedByAtomIndex) {
    if (value !== null) {
      firstKnown = value;
      break;
    }
  }
  for (let i = 0; i < changedByAtomIndex.length; i++) {
    if (changedByAtomIndex[i] === null) {
      changedByAtomIndex[i] = firstKnown;
    } else {
      break;
    }
  }

  const segments: WritingRevisionSegment[] = [];
  revisedAtoms.forEach((atom, index) => {
    const changed = changedByAtomIndex[index] ?? false;
    const last = segments[segments.length - 1];
    if (last && last.changed === changed) {
      last.text += atom.text;
    } else {
      segments.push({ text: atom.text, changed });
    }
  });
  return segments;
}
