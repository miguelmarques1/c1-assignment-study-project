import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';
import {
  ErrorTaxonomyValidationError,
  loadErrorTaxonomyFile,
  parseErrorTaxonomy,
  taxonomyFingerprint,
  type ErrorTaxonomy,
} from '../../src/taxonomy/error-taxonomy';

/**
 * Every taxonomy version ever committed, with the fingerprint of its
 * content. Changing a tag, a label or a family changes the fingerprint:
 * bump `version` in rules/error-taxonomy.yaml and add the new pin here, so
 * analyses and ledger records from different taxonomies never share a
 * version.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': '3485cba6a7eafa79661be8899803ba6480cc5f0df9d25eda9f8243d7bcacef72',
};

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
  it('loads_the_committed_taxonomy', () => {
    const loaded = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

    expect(loaded.version).toBe('1');
    expect(loaded.tags).toHaveLength(36);
    expect(loaded.families.map((family) => family.id).sort()).toEqual(['discourse', 'grammar', 'vocab']);
    expect(loaded.families.every((family) => family.analysis)).toBe(true);
    expect(loaded.analysisTags).toHaveLength(36);
    expect(loaded.tags.every((tag) => tag.label.length > 0)).toBe(true);
  });

  it('pins_the_fingerprint_of_each_version', () => {
    const loaded = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
    expect(PINNED_FINGERPRINTS[loaded.version]).toBe(loaded.fingerprint);
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
