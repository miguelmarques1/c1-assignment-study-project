import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify } from 'yaml';

import {
  ExcerptRulesValidationError,
  loadExcerptRulesFile,
  parseExcerptRules,
  ruleFingerprint,
  type ExcerptRules,
} from '../../src/excerpts/excerpt-rules';
import { ExcerptRulesService } from '../../src/excerpts/excerpt-rules.service';
import { EXCERPT_RULES_PATH } from '../../src/excerpts/excerpt-selection.constants';

/**
 * Every rules version ever committed, with the fingerprint of its
 * thresholds. Changing a threshold or the lexicon changes the fingerprint:
 * bump `version` in rules/excerpt-selection.yaml and add the new pin here,
 * so results selected under different rules never share a version.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': 'e4e9f122dbd2b5ae59546da8964c8b614c4ad996c79c5a4a9e7cc2aaa0d005e8',
};

interface RulesFile {
  version: string;
  eligibility: Record<string, number>;
  selection: Record<string, number>;
  fillers: string[];
}

const committedFile = (): RulesFile => parseYaml(readFileSync(EXCERPT_RULES_PATH, 'utf-8')) as RulesFile;

function rulesFrom(raw: unknown): ExcerptRules {
  const { rules, issues } = parseExcerptRules(raw);
  expect(issues).toEqual([]);
  return rules!;
}

const tempDir = mkdtempSync(join(tmpdir(), 'f09-rules-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe('excerpt selection rules', () => {
  it('the_committed_rules_file_is_valid', () => {
    const { version, rules } = loadExcerptRulesFile(EXCERPT_RULES_PATH);

    expect(version).toBe('1');
    expect(rules.eligibility).toEqual({
      minDurationMs: 3_000,
      maxDurationMs: 30_000,
      minWords: 8,
      maxFillerShare: 0.4,
      minConfidence: 0.4,
      maxLowConfidenceWordShare: 0.25,
    });
    expect(rules.selection).toEqual({ maxExcerpts: 12, spacingWindowMs: 300_000, maxPerWindow: 3, sparseBelow: 4 });
    expect(rules.fillers).toEqual(expect.arrayContaining(['uh', 'um', 'yeah', 'right', 'okay', 'hmm']));
  });

  it('the_rule_fingerprint_is_pinned_to_its_version', () => {
    const { version, fingerprint } = loadExcerptRulesFile(EXCERPT_RULES_PATH);

    const pinned = PINNED_FINGERPRINTS[version];
    expect(
      pinned,
      `rules version "${version}" has no pinned fingerprint: if you changed a threshold, bump the version and pin ${fingerprint}`,
    ).toBeDefined();
    expect(
      fingerprint,
      `rules/excerpt-selection.yaml changed under version "${version}": bump the version and pin the new fingerprint`,
    ).toBe(pinned);
  });

  it('the_fingerprint_changes_with_any_threshold_or_filler', () => {
    const base = committedFile();
    const baseline = ruleFingerprint(rulesFrom(base));
    const variants: Array<(file: RulesFile) => void> = [
      (f) => (f.eligibility.min_duration_ms = 2_500),
      (f) => (f.eligibility.max_duration_ms = 25_000),
      (f) => (f.eligibility.min_words = 9),
      (f) => (f.eligibility.max_filler_share = 0.35),
      (f) => (f.eligibility.min_confidence = 0.45),
      (f) => (f.eligibility.max_low_confidence_word_share = 0.2),
      (f) => (f.selection.max_excerpts = 11),
      (f) => (f.selection.spacing_window_ms = 240_000),
      (f) => (f.selection.max_per_window = 2),
      (f) => (f.selection.sparse_below = 5),
      (f) => f.fillers.push('like'),
    ];

    const seen = new Set([baseline]);
    for (const change of variants) {
      const file = structuredClone(base);
      change(file);
      const fingerprint = ruleFingerprint(rulesFrom(file));
      expect(seen.has(fingerprint)).toBe(false);
      seen.add(fingerprint);
    }

    const reordered = structuredClone(base);
    reordered.fillers.reverse();
    reordered.version = '99';
    expect(ruleFingerprint(rulesFrom(reordered))).toBe(baseline);
  });

  it('rejects_rules_that_could_exceed_6_minutes_of_audio', () => {
    const file = committedFile();
    file.selection.max_excerpts = 13;

    const { rules, issues } = parseExcerptRules(file);

    expect(rules).toBeNull();
    expect(issues).toEqual([expect.stringMatching(/^selection\.max_excerpts: .*6 minutes/)]);
  });

  it('rejects_incoherent_thresholds', () => {
    const file = committedFile();
    file.eligibility.min_duration_ms = 30_000;
    file.eligibility.max_filler_share = 1.2;
    file.selection.max_per_window = 0;

    const { rules, issues } = parseExcerptRules(file);

    expect(rules).toBeNull();
    expect(issues).toHaveLength(3);
    expect(issues.join('\n')).toMatch(/eligibility\.max_filler_share/);
    expect(issues.join('\n')).toMatch(/selection\.max_per_window/);
  });

  it('rejects_an_unnormalized_or_duplicated_lexicon', () => {
    const file = committedFile();
    file.fillers = ['Um', 'um', 'um', 'uh.'];

    const { issues } = parseExcerptRules(file);

    expect(issues).toEqual([
      expect.stringMatching(/^fillers\.0: "Um" is not a normalized token/),
      expect.stringMatching(/^fillers\.2: "um" is listed twice/),
      expect.stringMatching(/^fillers\.3: "uh\." is not a normalized token/),
    ]);
  });

  it('a_broken_file_stops_the_service_with_every_issue', () => {
    const file = committedFile();
    file.eligibility.min_words = 0;
    file.selection.spacing_window_ms = -1;
    file.fillers = [];
    const path = join(tempDir, 'broken.yaml');
    writeFileSync(path, stringify(file));

    let thrown: unknown;
    try {
      new ExcerptRulesService().load(path);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExcerptRulesValidationError);
    expect((thrown as ExcerptRulesValidationError).issues).toHaveLength(3);
    expect((thrown as Error).message).toMatch(/broken\.yaml: eligibility\.min_words/);
  });
});
