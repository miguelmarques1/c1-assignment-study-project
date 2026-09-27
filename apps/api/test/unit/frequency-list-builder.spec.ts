import { gzipSync } from 'node:zlib';

import { encode } from '@msgpack/msgpack';
import { describe, expect, it } from 'vitest';

import {
  CbpackFormatError,
  decodeCbpack,
  rankLemmas,
  renderFrequencyList,
  wordZipfs,
} from '../../src/generation/text/frequency-list-builder';
import { parseFrequencyList } from '../../src/generation/text/frequency-list';

/** A cBpack file: header, then one list of words per centibel bucket (bucket i = 10^(-i/100)). */
function cbpack(buckets: Record<number, string[]>): Uint8Array {
  const size = Math.max(...Object.keys(buckets).map(Number)) + 1;
  const lists = Array.from({ length: size }, (_, index) => buckets[index] ?? []);
  return gzipSync(encode([{ format: 'cB', version: 1 }, ...lists]));
}

const PROVENANCE = { source: 'test fixture', lemmatizerVersion: '3.0.4', generatedOn: '2026-09-27' };

describe('frequency list builder', () => {
  it('decodes_a_cbpack_fixture', () => {
    const buckets = decodeCbpack(cbpack({ 130: ['the'], 150: ['of', 'to'] }));
    const zipfs = wordZipfs(buckets);

    expect(buckets).toHaveLength(151);
    expect(zipfs.get('the')).toBeCloseTo(7.7);
    expect(zipfs.get('to')).toBeCloseTo(7.5);
    expect(() => decodeCbpack(gzipSync(encode([{ format: 'x', version: 1 }])))).toThrow(CbpackFormatError);
  });

  it('aggregates_inflected_forms_under_their_lemma', () => {
    const zipfs = new Map([
      ['run', 5.0],
      ['runs', 5.0],
      ['ran', 5.0],
      ['running', 5.0],
      ['walk', 5.2],
    ]);

    const rows = rankLemmas(zipfs);

    expect(rows.map((row) => row.lemma)).toEqual(['run', 'walk']);
    // Four forms at 10^-4 each: log10(4e-4) + 9 ≈ 5.60.
    expect(rows[0]?.zipf).toBeCloseTo(5.6, 1);
  });

  it('keeps_a_form_whose_proposed_lemma_the_corpus_barely_knows', () => {
    // `boss` is not the plural of `bos`, however the lemmatiser reads it.
    const rows = rankLemmas(new Map([['boss', 4.7], ['bos', 2.0]]));

    expect(rows.find((row) => row.lemma === 'boss')?.zipf).toBeCloseTo(4.7);
  });

  it('drops_non_alphabetic_tokens_and_contractions', () => {
    const rows = rankLemmas(new Map([['the', 7.7], ["don't", 6.0], ['2019', 5.0], ['x', 5.0], ['i', 6.0], ['co-op', 4.0]]));

    expect(rows.map((row) => row.lemma).sort()).toEqual(['i', 'the']);
  });

  it('ranks_by_aggregated_frequency_then_alphabetically', () => {
    const zipfs = new Map([['zeal', 4.0], ['apple', 4.0], ['moon', 5.0]]);

    expect(rankLemmas(zipfs).map((row) => [row.rank, row.lemma])).toEqual([
      [1, 'moon'],
      [2, 'apple'],
      [3, 'zeal'],
    ]);
    expect(renderFrequencyList(rankLemmas(zipfs), PROVENANCE)).toBe(renderFrequencyList(rankLemmas(zipfs), PROVENANCE));
  });

  it('emits_the_attribution_header_and_a_loadable_body', () => {
    const rows = Array.from({ length: 3000 }, (_, index) => ({
      rank: index + 1,
      lemma: `w${'a'.repeat(1 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`,
      zipf: 5,
    }));
    const text = renderFrequencyList(rows, PROVENANCE);

    expect(text).toMatch(/^# English lemma frequency list, top 3,000/);
    expect(text).toMatch(/wordfreq "large_en" by Robyn Speer et al\./);
    expect(text).toMatch(/commit [0-9a-f]{40}/);
    expect(text).toMatch(/CC BY-SA 4\.0/);
    expect(text).toMatch(/wink-lemmatizer 3\.0\.4/);
    expect(parseFrequencyList(text).issues).toEqual([]);
  });
});
