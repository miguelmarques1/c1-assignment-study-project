import { gunzipSync } from 'node:zlib';

import { decode } from '@msgpack/msgpack';

import { inflectionLemmas } from './lemmas';

/** The wordfreq commit the committed list was built from. Pinned, so a rebuild is reproducible. */
export const WORDFREQ_COMMIT = '912caf64b657478d1dff1138efdc078947d54bb1';

export const WORDFREQ_SOURCE_URL =
  `https://raw.githubusercontent.com/rspeer/wordfreq/${WORDFREQ_COMMIT}/wordfreq/data/large_en.msgpack.gz`;

/** How many lemmas the committed list holds. The gate reads the first 3,000; the rest are the K4–K5 band. */
export const FREQUENCY_LIST_SIZE = 5000;

/**
 * An inflected form joins a lemma only when the lemma is itself a word in
 * the source with a Zipf value no more than this far below the form's. The
 * lemmatiser guesses without context, and a guess the corpus barely knows
 * is a wrong one: `boss` is not the plural of `bos`, nor `species` of
 * `specie`. `was` → `be` and `better` → `good` still merge.
 */
const MAX_LEMMA_ZIPF_DROP = 1.5;

const WORD = /^[a-z]+$/;

export interface FrequencyListRow {
  rank: number;
  lemma: string;
  zipf: number;
}

/** Thrown when the source is not a wordfreq cBpack file. */
export class CbpackFormatError extends Error {
  override readonly name = 'CbpackFormatError';
}

/**
 * Decodes wordfreq's cBpack format: a gzipped msgpack list whose first
 * element is a `{ format: 'cB', version: 1 }` header and whose following
 * elements are the words of one centibel bucket each. Bucket `i` holds words
 * with a frequency of 10^(-i/100).
 */
export function decodeCbpack(gzipped: Uint8Array): string[][] {
  const data = decode(gunzipSync(gzipped)) as unknown;
  if (!Array.isArray(data) || data.length === 0) {
    throw new CbpackFormatError('cBpack data is not a non-empty list');
  }
  const header = data[0] as { format?: unknown; version?: unknown } | undefined;
  if (!header || header.format !== 'cB' || header.version !== 1) {
    throw new CbpackFormatError(`unexpected cBpack header: ${JSON.stringify(header)}`);
  }
  return data.slice(1).map((bucket, index) => {
    if (!Array.isArray(bucket) || bucket.some((word) => typeof word !== 'string')) {
      throw new CbpackFormatError(`bucket ${index} is not a list of words`);
    }
    return bucket as string[];
  });
}

/** Zipf value (log10 of occurrences per billion words) of every word, from its bucket. */
export function wordZipfs(buckets: readonly string[][]): Map<string, number> {
  const zipfs = new Map<string, number>();
  buckets.forEach((words, index) => {
    for (const word of words) {
      if (!zipfs.has(word)) {
        zipfs.set(word, 9 - index / 100);
      }
    }
  });
  return zipfs;
}

/** Lowercase alphabetic words, and no single letters except `a` and `i`. Contractions and hyphenated forms are dropped. */
export function isListableWord(word: string): boolean {
  return WORD.test(word) && (word.length > 1 || word === 'a' || word === 'i');
}

/**
 * The lemma a source word's frequency is credited to: its verb, noun or
 * adjective lemma, in that order, when that lemma is itself a listable word
 * of comparable frequency (see `MAX_LEMMA_ZIPF_DROP`), otherwise the word.
 */
export function lemmaFor(word: string, zipfs: ReadonlyMap<string, number>): string {
  const own = zipfs.get(word) ?? 0;
  for (const lemma of inflectionLemmas(word)) {
    const lemmaZipf = zipfs.get(lemma);
    if (isListableWord(lemma) && lemmaZipf !== undefined && lemmaZipf >= own - MAX_LEMMA_ZIPF_DROP) {
      return lemma;
    }
  }
  return word;
}

/**
 * Sums each listable word's frequency into its lemma and ranks the lemmas
 * by that sum, ties alphabetically, so the same source always yields the
 * same list.
 */
export function rankLemmas(zipfs: ReadonlyMap<string, number>, size: number = FREQUENCY_LIST_SIZE): FrequencyListRow[] {
  const totals = new Map<string, number>();
  for (const [word, zipf] of zipfs) {
    if (!isListableWord(word)) {
      continue;
    }
    const lemma = lemmaFor(word, zipfs);
    totals.set(lemma, (totals.get(lemma) ?? 0) + 10 ** (zipf - 9));
  }

  return [...totals.entries()]
    .map(([lemma, frequency]) => ({ lemma, zipf: Math.round((Math.log10(frequency) + 9) * 100) / 100, frequency }))
    .sort((a, b) => b.frequency - a.frequency || (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0))
    .slice(0, size)
    .map(({ lemma, zipf }, index) => ({ rank: index + 1, lemma, zipf }));
}

export interface FrequencyListProvenance {
  source: string;
  lemmatizerVersion: string;
  generatedOn: string;
}

/** The committed TSV: the attribution header CC BY-SA 4.0 requires, a column header, then one lemma per line. */
export function renderFrequencyList(rows: readonly FrequencyListRow[], provenance: FrequencyListProvenance): string {
  const header = [
    `# English lemma frequency list, top ${rows.length.toLocaleString('en-US')} — reference data for the F14 difficulty gate.`,
    `# Source: wordfreq "large_en" by Robyn Speer et al., https://github.com/rspeer/wordfreq, commit ${WORDFREQ_COMMIT}.`,
    `#   Read from: ${provenance.source}`,
    '# Licence: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). This derived list is shared under the same licence.',
    `# Lemmatised with wink-lemmatizer ${provenance.lemmatizerVersion}. Generated by \`pnpm frequency:build\` on ${provenance.generatedOn}. Do not edit by hand.`,
    'rank\tlemma\tzipf',
  ];
  const body = rows.map((row) => `${row.rank}\t${row.lemma}\t${row.zipf.toFixed(2)}`);
  return `${[...header, ...body].join('\n')}\n`;
}
