import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { FrequencyListService } from '../../src/generation/frequency-list.service';
import { FREQUENCY_LIST_PATH } from '../../src/generation/generation.constants';
import {
  FrequencyListUnavailableError,
  FrequencyListValidationError,
  loadFrequencyListFile,
  parseFrequencyList,
} from '../../src/generation/text/frequency-list';

const tempDir = mkdtempSync(join(tmpdir(), 'f14-frequency-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

const PRD_MESSAGE = 'Frequency list not found — the difficulty gate cannot run.';

/** The exact message, not just a substring: the PRD pins it. */
function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the action to throw');
}

function listText(lemmas: string[]): string {
  return ['# test list', 'rank\tlemma\tzipf', ...lemmas.map((lemma, index) => `${index + 1}\t${lemma}\t5.00`)].join('\n');
}

function manyLemmas(count: number): string[] {
  // Lowercase alphabetic and unique: aaaa, aaab, …
  return Array.from({ length: count }, (_, index) =>
    index
      .toString(26)
      .padStart(4, '0')
      .split('')
      .map((digit) => String.fromCharCode(97 + parseInt(digit, 26)))
      .join(''),
  );
}

describe('frequency list', () => {
  it('refuses_a_missing_file_with_the_prd_message', () => {
    const missing = join(tempDir, 'missing.tsv');

    expect(() => loadFrequencyListFile(missing)).toThrow(FrequencyListUnavailableError);
    expect(() => loadFrequencyListFile(missing)).toThrow(PRD_MESSAGE);
    expect(messageOf(() => new FrequencyListService().load(missing))).toBe(PRD_MESSAGE);
  });

  it('refuses_an_unreadable_file_with_the_same_message', () => {
    // A directory where the file should be cannot be read as text.
    expect(messageOf(() => loadFrequencyListFile(tempDir))).toBe(PRD_MESSAGE);
  });

  it('refuses_a_malformed_list_listing_every_issue', () => {
    const text = ['rank\tlemma\tzipf', '1\tthe\t7.7', '3\tof\t7.4', '4\tThe\t7.3', '5\tthe\t7.2', '6\tand\tx'].join('\n');
    const { ranks, issues } = parseFrequencyList(text);

    expect(ranks).toBeNull();
    expect(issues.join('\n')).toMatch(/rank 3 breaks the sequence \(expected 2\)/);
    expect(issues.join('\n')).toMatch(/"The" is not a lowercase alphabetic lemma/);
    expect(issues.join('\n')).toMatch(/"the" is listed twice/);
    expect(issues.join('\n')).toMatch(/zipf "x" is not a number/);
    expect(issues.join('\n')).toMatch(/at least 3000 are required/);

    const file = join(tempDir, 'malformed.tsv');
    writeFileSync(file, text);
    expect(() => loadFrequencyListFile(file)).toThrow(FrequencyListValidationError);
    expect(() => loadFrequencyListFile(file)).toThrow(/^Frequency list is invalid — the difficulty gate cannot run:/);
  });

  it('committed_list_has_5000_ranked_lemmas_and_attribution', () => {
    const list = loadFrequencyListFile(FREQUENCY_LIST_PATH);
    const header = readFileSync(FREQUENCY_LIST_PATH, 'utf-8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('#'))
      .join('\n');

    expect(list.size).toBe(5000);
    expect(list.lemmaRank('the')).toBe(1);
    expect(header).toMatch(/wordfreq/);
    expect(header).toMatch(/commit [0-9a-f]{40}/);
    expect(header).toMatch(/CC BY-SA 4\.0/);
  });

  it('rank_lookup_uses_lemma_candidates', () => {
    const list = loadFrequencyListFile(FREQUENCY_LIST_PATH);

    expect(list.rankOf('running')).toBe(list.lemmaRank('run'));
    expect(list.rankOf('women')).toBe(list.lemmaRank('woman'));
    expect(list.rankOf('better')).toBe(list.lemmaRank('good'));
    expect(list.rankOf('was')).toBe(list.lemmaRank('be'));
    expect(list.rankOf('xylophonist')).toBeUndefined();
  });

  it('version_is_derived_from_the_file_content', () => {
    const lemmas = manyLemmas(3000);
    const first = join(tempDir, 'a.tsv');
    const second = join(tempDir, 'b.tsv');
    const crlf = join(tempDir, 'c.tsv');
    writeFileSync(first, listText(lemmas));
    writeFileSync(second, listText([...lemmas.slice(0, -1), 'zzzzz']));
    writeFileSync(crlf, listText(lemmas).replace(/\n/g, '\r\n'));

    const version = loadFrequencyListFile(first).version;
    expect(version).toMatch(/^en-lemmas-top5000@[0-9a-f]{12}$/);
    expect(loadFrequencyListFile(second).version).not.toBe(version);
    // A Windows checkout's line endings do not make it a different list.
    expect(loadFrequencyListFile(crlf).version).toBe(version);
  });
});
