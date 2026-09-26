import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { AnalysisTaxonomyMismatchError, verifyAnalysisPrompt } from '../../src/boot/verify-analysis-prompt';
import { loadPromptFile } from '../../src/prompts/prompt-file-loader';
import type { PromptRegistryService } from '../../src/prompts/prompt-registry.service';
import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';
import {
  ErrorTaxonomyValidationError,
  loadErrorTaxonomyFile,
  parseErrorTaxonomy,
  taxonomyFingerprint,
  type ErrorTaxonomy,
} from '../../src/taxonomy/error-taxonomy';
import type { ErrorTaxonomyService } from '../../src/taxonomy/error-taxonomy.service';

const LESSON_ANALYSIS_PROMPT_PATH = join(__dirname, '..', '..', 'prompts', 'lesson-analysis.yaml');

function fakeRegistry(promptPath: string): PromptRegistryService {
  const { prompt, issues } = loadPromptFile(promptPath);
  if (!prompt) {
    throw new Error(`fixture prompt failed to load: ${issues.join('; ')}`);
  }
  return { get: () => prompt } as unknown as PromptRegistryService;
}

function fakeTaxonomy(analysisTags: string[]): ErrorTaxonomyService {
  return { current: () => ({ analysisTags }) } as unknown as ErrorTaxonomyService;
}

/**
 * Every taxonomy version ever committed, with the fingerprint of its
 * content. Changing a tag, a label or a family changes the fingerprint:
 * bump `version` in rules/error-taxonomy.yaml and add the new pin here, so
 * analyses and ledger records from different taxonomies never share a
 * version.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': '3485cba6a7eafa79661be8899803ba6480cc5f0df9d25eda9f8243d7bcacef72',
  '2': '0b04072773c2672f7649fc578b1456c3b8dfa797d2476d079b4fbb1bf7dbf75d',
};

/** Azure's en-US IPA inventory as F10 receives it (confirmed live in F12 stage 1): `g` is ASCII, `ɹ` is U+0279. */
const EN_US_PHONEMES = [
  'i', 'ɪ', 'eɪ', 'ɛ', 'æ', 'ɑ', 'ɔ', 'oʊ', 'ʊ', 'u', 'ʌ', 'ə', 'ɚ', 'ɝ', 'aɪ', 'aʊ', 'ɔɪ',
  'p', 'b', 't', 'd', 'k', 'g', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h', 'tʃ', 'dʒ', 'm', 'n', 'ŋ', 'l', 'ɹ', 'w', 'j',
];

function taxonomyFrom(raw: unknown): ErrorTaxonomy {
  const { taxonomy, issues } = parseErrorTaxonomy(raw);
  expect(issues).toEqual([]);
  return taxonomy!;
}

function baseFile() {
  return {
    version: '1',
    families: [
      { id: 'grammar', label: 'Grammar', analysis: true },
      { id: 'vocab', label: 'Vocabulary', analysis: true },
    ],
    tags: [
      { tag: 'grammar:past-simple', label: 'Past simple', family: 'grammar', description: 'x' },
      { tag: 'vocab:collocation', label: 'Collocation', family: 'vocab', description: 'x' },
    ],
  };
}

const tempDir = mkdtempSync(join(tmpdir(), 'f11-taxonomy-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function writeTempFile(content: unknown): string {
  const path = join(tempDir, `${Math.random().toString(36).slice(2)}.yaml`);
  writeFileSync(path, stringify(content));
  return path;
}

describe('error taxonomy', () => {
  it('loads_taxonomy_v2_with_the_phoneme_family', () => {
    const loaded = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

    expect(loaded.version).toBe('2');
    expect(loaded.tags).toHaveLength(77);
    expect(loaded.families.map((family) => family.id).sort()).toEqual(['discourse', 'grammar', 'phoneme', 'vocab']);
    const phoneme = loaded.families.find((family) => family.id === 'phoneme')!;
    expect(phoneme).toMatchObject({ analysis: false, format: 'ipa' });
    expect(loaded.families.filter((family) => family.id !== 'phoneme').every((family) => family.format === 'slug')).toBe(
      true,
    );

    const phonemeTags = loaded.tags.filter((tag) => tag.family === 'phoneme');
    expect(phonemeTags.map((tag) => tag.tag).sort()).toEqual(EN_US_PHONEMES.map((symbol) => `phoneme:/${symbol}/`).sort());
    expect(phonemeTags.every((tag) => /^\/.+\/ as in ".+"$/u.test(tag.label))).toBe(true);
    expect(loaded.tags.every((tag) => tag.label.length > 0 && tag.label.length <= 120)).toBe(true);
    expect(loaded.familyOf.get('phoneme:/θ/')).toBe('phoneme');
    expect(loaded.familyOf.get('grammar:conditional-3')).toBe('grammar');
  });

  it('pins_the_fingerprint_of_each_version', () => {
    const loaded = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
    expect(PINNED_FINGERPRINTS[loaded.version]).toBe(loaded.fingerprint);

    // The same content under a new label, without a bump, is a different taxonomy.
    const relabelled = {
      ...loaded,
      tags: loaded.tags.map((tag) => (tag.tag === 'phoneme:/θ/' ? { ...tag, label: 'Theta' } : tag)),
    };
    expect(taxonomyFingerprint(relabelled)).not.toBe(PINNED_FINGERPRINTS[loaded.version]);
  });

  it('the_analysis_tags_are_unchanged_by_v2', () => {
    const loaded = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

    expect(loaded.analysisTags).toHaveLength(36);
    expect(loaded.analysisTags.some((tag) => tag.startsWith('phoneme:'))).toBe(false);
    // v2 minus the phoneme family is byte-for-byte v1, so F11's prompt enum and every v1 analysis still line up.
    const withoutPhonemes: ErrorTaxonomy = {
      version: '1',
      families: loaded.families.filter((family) => family.id !== 'phoneme'),
      tags: loaded.tags.filter((tag) => tag.family !== 'phoneme'),
    };
    expect(taxonomyFingerprint(withoutPhonemes)).toBe(PINNED_FINGERPRINTS['1']);
  });

  it('accepts_ipa_tags_only_in_ipa_families', () => {
    const file = {
      version: '1',
      families: [
        { id: 'grammar', label: 'Grammar', analysis: true },
        { id: 'phoneme', label: 'Pronunciation', analysis: false, format: 'ipa' },
      ],
      tags: [
        { tag: 'grammar:/θ/', label: 'X', family: 'grammar', description: 'x' },
        { tag: 'phoneme:theta', label: 'Y', family: 'phoneme', description: 'y' },
        { tag: 'phoneme:/a b/', label: 'Z', family: 'phoneme', description: 'z' },
        { tag: 'phoneme:/θ/', label: 'Theta', family: 'phoneme', description: 't' },
      ],
    };
    const { taxonomy, issues } = parseErrorTaxonomy(file);
    expect(taxonomy).toBeNull();
    expect(issues).toHaveLength(3);
    expect(issues.some((issue) => issue.startsWith('tags.0.tag') && issue.includes('kebab-slug'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('tags.1.tag') && issue.includes('family:/symbol/'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('tags.2.tag'))).toBe(true);
  });

  it('the_fingerprint_ignores_key_order_but_not_content', () => {
    const a = taxonomyFrom(baseFile());
    const shuffled = { ...baseFile(), tags: [...baseFile().tags].reverse() };
    const b = taxonomyFrom(shuffled);
    expect(taxonomyFingerprint(a)).toBe(taxonomyFingerprint(b));

    const changed = taxonomyFrom({
      ...baseFile(),
      tags: [{ ...baseFile().tags[0], description: 'different' }, baseFile().tags[1]],
    });
    expect(taxonomyFingerprint(a)).not.toBe(taxonomyFingerprint(changed));
  });

  it('rejects_duplicate_tags', () => {
    const file = { ...baseFile(), tags: [...baseFile().tags, baseFile().tags[0]] };
    const { taxonomy, issues } = parseErrorTaxonomy(file);
    expect(taxonomy).toBeNull();
    expect(issues.some((issue) => issue.includes('grammar:past-simple') && issue.includes('listed twice'))).toBe(
      true,
    );
  });

  it('rejects_a_tag_outside_a_declared_family', () => {
    const file = { ...baseFile(), tags: [{ tag: 'idiom:x', label: 'X', family: 'idiom', description: 'x' }] };
    const { taxonomy, issues } = parseErrorTaxonomy(file);
    expect(taxonomy).toBeNull();
    expect(issues.some((issue) => issue.includes('tags.0.family'))).toBe(true);
  });

  it('rejects_a_malformed_tag', () => {
    const file = {
      ...baseFile(),
      tags: [{ tag: 'Grammar:Third_Conditional', label: 'X', family: 'grammar', description: 'x' }],
    };
    const { taxonomy, issues } = parseErrorTaxonomy(file);
    expect(taxonomy).toBeNull();
    expect(issues.some((issue) => issue.includes('tags.0.tag'))).toBe(true);
  });

  it('rejects_a_tag_whose_prefix_does_not_match_its_declared_family', () => {
    const file = {
      ...baseFile(),
      tags: [{ tag: 'grammar:x', label: 'X', family: 'vocab', description: 'x' }],
    };
    const { taxonomy, issues } = parseErrorTaxonomy(file);
    expect(taxonomy).toBeNull();
    expect(issues.some((issue) => issue.includes('does not start with its declared family'))).toBe(true);
  });

  it('rejects_a_missing_or_unparsable_file', () => {
    expect(() => loadErrorTaxonomyFile(join(tempDir, 'does-not-exist.yaml'))).toThrow(ErrorTaxonomyValidationError);

    const garbage = join(tempDir, 'garbage.yaml');
    writeFileSync(garbage, ': not: valid: yaml: [');
    expect(() => loadErrorTaxonomyFile(garbage)).toThrow(ErrorTaxonomyValidationError);
  });

  it('the_prompt_enum_matches_the_analysis_tags', () => {
    const { analysisTags } = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
    const registry = fakeRegistry(LESSON_ANALYSIS_PROMPT_PATH);
    const taxonomy = fakeTaxonomy(analysisTags);

    expect(() => verifyAnalysisPrompt({ registry, taxonomy })).not.toThrow();
  });

  it('boot_check_names_missing_and_extra_tags', () => {
    const { analysisTags } = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
    const registry = fakeRegistry(LESSON_ANALYSIS_PROMPT_PATH);
    // One tag added (the prompt won't have it) and one removed (the prompt still does).
    const skewed = [...analysisTags.slice(1), 'grammar:made-up-tag'];
    const taxonomy = fakeTaxonomy(skewed);

    try {
      verifyAnalysisPrompt({ registry, taxonomy });
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisTaxonomyMismatchError);
      const mismatch = error as AnalysisTaxonomyMismatchError;
      expect(mismatch.issues.join('\n')).toContain('grammar:made-up-tag');
      expect(mismatch.issues.join('\n')).toContain(analysisTags[0]!);
    }
  });

  it('every_issue_is_reported_at_once', () => {
    const file = writeTempFile({
      version: '1',
      families: [{ id: 'grammar', label: 'Grammar', analysis: true }],
      tags: [
        { tag: 'Bad Tag', label: 'X', family: 'grammar', description: 'x' },
        { tag: 'vocab:y', label: 'Y', family: 'vocab', description: 'y' },
      ],
    });
    try {
      loadErrorTaxonomyFile(file);
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorTaxonomyValidationError);
      const validationError = error as ErrorTaxonomyValidationError;
      expect(validationError.issues.length).toBeGreaterThanOrEqual(2);
    }
  });
});
