import { describe, expect, it } from 'vitest';

import {
  corpusFingerprint,
  loadSpeakingCorpus,
  parseSpeakingCorpus,
  wordsOf,
  type SpeakingCorpus,
  type TaxonomyLookup,
} from '../../src/speaking/corpus/speaking-corpus';
import { SPEAKING_TASKS_PATH } from '../../src/speaking/speaking.constants';
import { loadErrorTaxonomyFile } from '../../src/taxonomy/error-taxonomy';
import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';

/** The real taxonomy in force, adapted to the corpus loader's minimal interface. */
function realTaxonomy(): TaxonomyLookup {
  const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
  return {
    has: (tag) => taxonomy.familyOf.has(tag),
    familyOf: (tag) => taxonomy.familyOf.get(tag) ?? null,
    tagsInFamily: (family) => taxonomy.tags.filter((entry) => entry.family === family).map((entry) => entry.tag),
  };
}

function fakeTaxonomy(tags: Array<{ tag: string; family: string }>): TaxonomyLookup {
  const familyOf = new Map(tags.map((entry) => [entry.tag, entry.family]));
  return {
    has: (tag) => familyOf.has(tag),
    familyOf: (tag) => familyOf.get(tag) ?? null,
    tagsInFamily: (family) => tags.filter((entry) => entry.family === family).map((entry) => entry.tag),
  };
}

/**
 * The committed corpus's fingerprint, pinned the same way the taxonomy pins
 * its own versions: a passage, prompt or drill changed under version "1"
 * fails this test, which is the point — bump `version` with any change.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': '8bc2ff7f1d1a86415d3ecf94cc71471f8a20162f8c75c304129f9c913b6a2357',
};

describe('speaking corpus', () => {
  it('loads_the_committed_corpus_and_pins_its_fingerprint', () => {
    const loaded = loadSpeakingCorpus(SPEAKING_TASKS_PATH, realTaxonomy());

    expect(loaded.readAloud.length).toBeGreaterThanOrEqual(30);
    expect(loaded.openResponse.length).toBeGreaterThanOrEqual(20);
    expect(PINNED_FINGERPRINTS[loaded.version]).toBe(loaded.fingerprint);
  });

  it('every_passage_is_25_to_60_words_of_plain_prose', () => {
    const loaded = loadSpeakingCorpus(SPEAKING_TASKS_PATH, realTaxonomy());

    for (const entry of loaded.readAloud) {
      const words = wordsOf(entry.text);
      expect(words.length, `${entry.id}: ${words.length} words`).toBeGreaterThanOrEqual(25);
      expect(words.length, `${entry.id}: ${words.length} words`).toBeLessThanOrEqual(60);
      expect(entry.text, entry.id).not.toMatch(/[0-9]/);
      expect(entry.text, entry.id).not.toMatch(/-/);
    }
    for (const entry of loaded.openResponse) {
      const words = wordsOf(entry.prompt);
      expect(words.length, `${entry.id}: ${words.length} words`).toBeGreaterThanOrEqual(8);
      expect(words.length, `${entry.id}: ${words.length} words`).toBeLessThanOrEqual(60);
    }
  });

  it('every_drill_word_appears_in_its_passage', () => {
    const loaded = loadSpeakingCorpus(SPEAKING_TASKS_PATH, realTaxonomy());

    for (const entry of loaded.readAloud) {
      const tokens = new Set(wordsOf(entry.text));
      for (const [tag, words] of Object.entries(entry.drills)) {
        expect(words.length, `${entry.id}:${tag}`).toBeGreaterThanOrEqual(2);
        expect(words.length, `${entry.id}:${tag}`).toBeLessThanOrEqual(6);
        for (const word of words) {
          expect(tokens.has(word.toLowerCase()), `${entry.id}:${tag} "${word}"`).toBe(true);
        }
      }
    }
  });

  it('every_phoneme_tag_is_drilled_by_at_least_two_passages', () => {
    const taxonomy = realTaxonomy();
    const loaded = loadSpeakingCorpus(SPEAKING_TASKS_PATH, taxonomy);
    const counts = new Map(taxonomy.tagsInFamily('phoneme').map((tag) => [tag, 0]));

    for (const entry of loaded.readAloud) {
      for (const tag of Object.keys(entry.drills)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    for (const [tag, count] of counts) {
      expect(count, tag).toBeGreaterThanOrEqual(2);
    }
  });

  it('every_discourse_and_vocab_tag_is_targeted_by_a_prompt', () => {
    const taxonomy = realTaxonomy();
    const loaded = loadSpeakingCorpus(SPEAKING_TASKS_PATH, taxonomy);
    const required = new Set([...taxonomy.tagsInFamily('discourse'), ...taxonomy.tagsInFamily('vocab')]);
    const targeted = new Set(loaded.openResponse.flatMap((entry) => entry.targets));

    for (const tag of required) {
      expect(targeted.has(tag), tag).toBe(true);
    }
  });

  it('rejects_an_unknown_tag_a_duplicate_id_and_a_digit_with_every_issue_listed', () => {
    const taxonomy = fakeTaxonomy([
      { tag: 'phoneme:/θ/', family: 'phoneme' },
      { tag: 'discourse:hedging', family: 'discourse' },
    ]);

    const raw = {
      version: '1',
      read_aloud: [
        {
          id: 'dup-id',
          // A digit in the 30th token, past the allowed character set (A3).
          text: Array.from({ length: 29 }, () => 'word').join(' ') + ' nine9',
          drills: { 'phoneme:/θ/': ['word', 'nine9'], 'phoneme:/unknown/': ['word', 'nine9'] },
        },
        {
          id: 'dup-id',
          text: Array.from({ length: 30 }, () => 'word').join(' '),
          drills: { 'phoneme:/θ/': ['word', 'nothing'] },
        },
      ],
      open_response: [
        { id: 'or-one', prompt: Array.from({ length: 10 }, () => 'word').join(' '), targets: ['discourse:hedging'] },
      ],
    };

    const { corpus, issues } = parseSpeakingCorpus(raw, taxonomy);

    expect(corpus).toBeNull();
    expect(issues.some((issue) => issue.includes('phoneme:/unknown/'))).toBe(true);
    expect(issues.some((issue) => issue.includes('dup-id'))).toBe(true);
    expect(issues.some((issue) => issue.toLowerCase().includes('character outside'))).toBe(true);
    expect(issues.some((issue) => issue.toLowerCase().includes('word "nothing"'))).toBe(true);
  });

  it('corpusFingerprint_is_stable_for_the_same_content_regardless_of_order', () => {
    const corpus: SpeakingCorpus = {
      version: '1',
      readAloud: [
        { id: 'a', text: 'a', drills: { 'phoneme:/i/': ['a', 'b'] } },
        { id: 'b', text: 'b', drills: {} },
      ],
      openResponse: [{ id: 'x', prompt: 'p', hint: null, targets: ['discourse:hedging'] }],
    };
    const reordered = { ...corpus, readAloud: [...corpus.readAloud].reverse() };

    expect(corpusFingerprint(corpus)).toBe(corpusFingerprint(reordered));
  });
});
