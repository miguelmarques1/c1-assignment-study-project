import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { GENERATION_RULES_PATH } from '../../src/generation/generation.constants';
import {
  GenerationRulesValidationError,
  expandMarker,
  loadGenerationRulesFile,
  parseGenerationRules,
  rulesFingerprint,
} from '../../src/generation/rules/generation-rules';
import { loadErrorTaxonomyFile } from '../../src/taxonomy/error-taxonomy';
import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';

/**
 * Every rules version ever committed, with its fingerprint. Changing a
 * threshold, a genre, a banned phrase, a lexicon or a marker changes the
 * fingerprint: bump `version` in rules/content-generation.yaml and pin the
 * new value here, so items checked under different rules never share a version.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': '369ead2363941aa274c4f781e89566bfa4110462852253542ec4ff9fd490e4ca',
};

const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

/** A mutable copy of the YAML, edited per test (`parseYaml` returns an untyped value on purpose). */
const committedFile = () => parseYaml(readFileSync(GENERATION_RULES_PATH, 'utf-8'));
type RulesFile = ReturnType<typeof committedFile>;

function issuesFor(change: (file: RulesFile) => void): string[] {
  const file = committedFile();
  change(file);
  return parseGenerationRules(file, taxonomy).issues;
}

describe('content generation rules', () => {
  it('loads_the_committed_rules_file', () => {
    const { version, rules, markers } = loadGenerationRulesFile(GENERATION_RULES_PATH, taxonomy);

    expect(version).toBe('1');
    expect(Object.keys(rules.itemTypes).sort()).toEqual(['error_review', 'grammar', 'reading', 'vocabulary']);
    expect(rules.questions).toEqual({ count: 5, formats: ['multiple_choice', 'fill_blank'] });
    expect(rules.batch).toEqual({ mix: { reading: 3, grammar: 3, vocabulary: 3, error_review: 3 }, maxItemsPerTag: 2 });
    expect(markers.get('grammar:conditional-3')?.length).toBeGreaterThan(0);
  });

  it('reading_thresholds_match_the_prd', () => {
    const { rules } = loadGenerationRulesFile(GENERATION_RULES_PATH, taxonomy);

    expect(rules.frequencyRankCutoff).toBe(3000);
    expect(rules.itemTypes.reading).toEqual({
      words: { min: 450, max: 700 },
      meanSentenceLength: { min: 18, max: 26 },
      minTypeTokenRatio: 0.45,
      minOutOfFrequencyRatio: 0.12,
      minStructureOccurrences: 3,
      targetTags: { min: 1, max: 2 },
      difficulty: 4,
    });
    for (const type of ['vocabulary', 'grammar', 'error_review'] as const) {
      expect(rules.itemTypes[type].words).toEqual({ min: 250, max: 450 });
      expect(rules.itemTypes[type].meanSentenceLength).toEqual({ min: 18, max: 26 });
      expect(rules.itemTypes[type].minOutOfFrequencyRatio).toBe(0.12);
    }
  });

  it('rejects_a_min_above_its_max', () => {
    const issues = issuesFor((file) => {
      file.item_types.grammar.words = { min: 500, max: 450 };
    });

    expect(issues).toEqual([expect.stringMatching(/^item_types\.grammar\.words\.min: must be below words\.max/)]);
  });

  it('requires_exactly_ten_unique_genres', () => {
    expect(issuesFor((file) => file.genres.pop()).join('\n')).toMatch(/exactly 10 genres, got 9/);
    expect(issuesFor((file) => file.genres.push('podcast recap')).join('\n')).toMatch(/exactly 10 genres, got 11/);
    expect(
      issuesFor((file) => {
        file.genres[9] = file.genres[0];
      }).join('\n'),
    ).toMatch(/genres\.9: "opinion column" is listed twice/);
  });

  it('rejects_a_batch_mix_above_twelve_items', () => {
    const issues = issuesFor((file) => {
      file.batch.mix.reading = 4;
    });

    expect(issues).toEqual([expect.stringMatching(/^batch\.mix: must plan between 1 and 12 items .*got 13/)]);
  });

  it('rejects_a_marker_for_an_unknown_or_phoneme_tag', () => {
    const issues = issuesFor((file) => {
      file.structure_markers['grammar:not-a-tag'] = ['\\bx\\b'];
      file.structure_markers['phoneme:/θ/'] = ['th'];
    });

    expect(issues).toHaveLength(2);
    expect(issues.join('\n')).toMatch(/grammar:not-a-tag: not a tag in the error taxonomy/);
    expect(issues.join('\n')).toMatch(/phoneme:\/θ\/: phoneme tags are never generation targets/);
  });

  it('rejects_a_marker_that_does_not_compile', () => {
    const issues = issuesFor((file) => {
      file.structure_markers['grammar:modal-verb'] = ['\\b(?:can'];
    });

    expect(issues).toEqual([expect.stringMatching(/^structure_markers\.grammar:modal-verb\.0: does not compile/)]);
  });

  it('rejects_an_unknown_lexicon_reference', () => {
    const issues = issuesFor((file) => {
      file.structure_markers['grammar:modal-verb'] = ['\\b(?:{modals})\\b'];
    });

    expect(issues).toEqual([expect.stringMatching(/grammar:modal-verb\.0: unknown lexicon \{modals\}/)]);
  });

  it('rejects_a_banned_phrase_that_is_not_normalised', () => {
    const issues = issuesFor((file) => {
      file.banned_phrases.push('Delve Into', 'in  today’s world');
    });

    expect(issues).toHaveLength(2);
  });

  it('expands_lexicon_references_in_markers', () => {
    const { markers } = loadGenerationRulesFile(GENERATION_RULES_PATH, taxonomy);
    const [first] = markers.get('grammar:conditional-3') ?? [];

    expect(first?.test('if they had been warned they would have left')).toBe(true);
    expect(first?.test('had we written earlier, the council might not have objected')).toBe(true);
    expect(first?.test('if they were warned they would leave')).toBe(false);
    expect(expandMarker('x{modal}y', { modal: ['may', 'ought to'] }).source).toBe('xought\\s+to|mayy');
  });

  it('fingerprint_of_each_version_is_pinned', () => {
    const { version, fingerprint } = loadGenerationRulesFile(GENERATION_RULES_PATH, taxonomy);

    const pinned = PINNED_FINGERPRINTS[version];
    expect(
      pinned,
      `rules version "${version}" has no pinned fingerprint: if you changed a value, bump the version and pin ${fingerprint}`,
    ).toBeDefined();
    expect(
      fingerprint,
      `rules/content-generation.yaml changed under version "${version}": bump the version and pin the new fingerprint`,
    ).toBe(pinned);
  });

  it('fingerprint_changes_with_any_value_and_ignores_list_order', () => {
    const baseline = rulesFingerprint(parseGenerationRules(committedFile(), taxonomy).rules!);
    const variants: Array<(file: RulesFile) => void> = [
      (f) => (f.item_types.reading.min_out_of_frequency_ratio = 0.13),
      (f) => (f.item_types.grammar.words.max = 460),
      (f) => (f.frequency_rank_cutoff = 2500),
      (f) => (f.batch.max_items_per_tag = 3),
      (f) => f.banned_phrases.push('rich tapestries'),
      (f) => f.lexicons.hedge.push('supposedly'),
      (f) => f.structure_markers['grammar:modal-verb'].push('\\bmust\\b'),
      (f) => (f.genres[0] = 'op-ed'),
    ];
    const seen = new Set([baseline]);
    for (const change of variants) {
      const file = committedFile();
      change(file);
      const fingerprint = rulesFingerprint(parseGenerationRules(file, taxonomy).rules!);
      expect(seen.has(fingerprint)).toBe(false);
      seen.add(fingerprint);
    }

    const reordered = committedFile();
    reordered.genres.reverse();
    reordered.banned_phrases.reverse();
    reordered.version = '99';
    expect(rulesFingerprint(parseGenerationRules(reordered, taxonomy).rules!)).toBe(baseline);
  });

  it('a_broken_file_names_itself_in_the_error', () => {
    expect(() => loadGenerationRulesFile('does-not-exist.yaml', taxonomy)).toThrow(GenerationRulesValidationError);
    expect(() => loadGenerationRulesFile('does-not-exist.yaml', taxonomy)).toThrow(/does-not-exist\.yaml: could not be read/);
  });
});
