import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { lemmaCandidates } from './lemmas';

/** The gate reads the top 3,000 (PRD F14). A shorter list could not answer its question. */
export const MIN_FREQUENCY_LIST_SIZE = 3000;

const LEMMA = /^[a-z]+$/;
const COLUMNS = 'rank\tlemma\tzipf';
const VERSION_PREFIX = 'en-lemmas-top5000@';

/** The PRD's exact wording for a list that is missing or unreadable. */
export const FREQUENCY_LIST_NOT_FOUND_MESSAGE = 'Frequency list not found — the difficulty gate cannot run.';

/** Missing or unreadable at boot: the API refuses to start rather than ship unverified content (PRD F14). */
export class FrequencyListUnavailableError extends Error {
  override readonly name = 'FrequencyListUnavailableError';
  constructor(cause?: unknown) {
    super(FREQUENCY_LIST_NOT_FOUND_MESSAGE, { cause });
  }
}

/** Present but malformed: also a boot refusal, with every problem listed. */
export class FrequencyListValidationError extends Error {
  override readonly name = 'FrequencyListValidationError';
  constructor(readonly issues: string[]) {
    super(`Frequency list is invalid — the difficulty gate cannot run:\n  ${issues.join('\n  ')}`);
  }
}

export interface LoadedFrequencyList {
  /** `en-lemmas-top5000@` + the first 12 hex characters of the SHA-256 of the file with LF line endings. */
  version: string;
  size: number;
  /** Rank of a lemma exactly as listed, or undefined. */
  lemmaRank(lemma: string): number | undefined;
  /**
   * Best rank among a lowercase word and its lemmas (A19), or undefined when
   * none of them is listed. Memoised: a text repeats its words.
   */
  rankOf(word: string): number | undefined;
}

/** Validates the file's text. Never throws: every problem comes back in `issues`. */
export function parseFrequencyList(text: string): { ranks: Map<string, number> | null; issues: string[] } {
  const issues: string[] = [];
  const ranks = new Map<string, number>();
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  let lineNumber = 0;
  let headerSeen = false;
  for (const line of lines) {
    lineNumber += 1;
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    if (!headerSeen) {
      headerSeen = true;
      if (line !== COLUMNS) {
        issues.push(`line ${lineNumber}: expected the column header "rank<TAB>lemma<TAB>zipf"`);
      }
      continue;
    }
    const [rankText, lemma, zipfText, ...extra] = line.split('\t');
    const rank = Number(rankText);
    if (extra.length > 0 || lemma === undefined || zipfText === undefined) {
      issues.push(`line ${lineNumber}: expected 3 tab-separated columns`);
      continue;
    }
    if (!Number.isInteger(rank) || rank !== ranks.size + 1) {
      issues.push(`line ${lineNumber}: rank ${rankText} breaks the sequence (expected ${ranks.size + 1})`);
    }
    if (!LEMMA.test(lemma)) {
      issues.push(`line ${lineNumber}: "${lemma}" is not a lowercase alphabetic lemma`);
    } else if (ranks.has(lemma)) {
      issues.push(`line ${lineNumber}: "${lemma}" is listed twice`);
    }
    if (!Number.isFinite(Number(zipfText)) || zipfText.trim() === '') {
      issues.push(`line ${lineNumber}: zipf "${zipfText}" is not a number`);
    }
    if (!ranks.has(lemma)) {
      ranks.set(lemma, ranks.size + 1);
    }
  }

  if (!headerSeen) {
    issues.push('the file has no column header and no rows');
  } else if (ranks.size < MIN_FREQUENCY_LIST_SIZE) {
    issues.push(`the list has ${ranks.size} lemmas; at least ${MIN_FREQUENCY_LIST_SIZE} are required`);
  }
  return issues.length > 0 ? { ranks: null, issues } : { ranks, issues: [] };
}

export function frequencyListVersion(text: string): string {
  const digest = createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
  return `${VERSION_PREFIX}${digest.slice(0, 12)}`;
}

export function buildFrequencyList(ranks: ReadonlyMap<string, number>, version: string): LoadedFrequencyList {
  const memo = new Map<string, number | undefined>();
  return {
    version,
    size: ranks.size,
    lemmaRank: (lemma) => ranks.get(lemma),
    rankOf(word) {
      if (memo.has(word)) {
        return memo.get(word);
      }
      let best: number | undefined;
      for (const candidate of lemmaCandidates(word)) {
        const rank = ranks.get(candidate);
        if (rank !== undefined && (best === undefined || rank < best)) {
          best = rank;
        }
      }
      memo.set(word, best);
      return best;
    },
  };
}

/** Reads and validates the list. Missing or unreadable → the PRD's message; malformed → every issue. */
export function loadFrequencyListFile(filePath: string): LoadedFrequencyList {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new FrequencyListUnavailableError(error);
  }
  const { ranks, issues } = parseFrequencyList(text);
  if (!ranks) {
    throw new FrequencyListValidationError(issues);
  }
  return buildFrequencyList(ranks, frequencyListVersion(text));
}
