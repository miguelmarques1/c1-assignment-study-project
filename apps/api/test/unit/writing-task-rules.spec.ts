import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ERROR_TAXONOMY_PATH } from '../../src/taxonomy/error-taxonomy.constants';
import { loadErrorTaxonomyFile } from '../../src/taxonomy/error-taxonomy';
import { WRITING_TASK_RULES_PATH } from '../../src/writing/writing.constants';
import {
  checkRequirementsCoverage,
  loadWritingTaskRulesFile,
  parseWritingTaskRules,
  WritingTaskRulesValidationError,
  writingTaskRulesFingerprint,
} from '../../src/writing/rules/writing-task-rules';

/**
 * Every rules version ever committed, with its fingerprint. Bump `version`
 * in rules/writing-tasks.yaml with any change and pin the new value here.
 */
const PINNED_FINGERPRINTS: Record<string, string> = {
  '1': '1691be17a35e96a88db0b34552a1613f301b3dc6992923e33888b1dbe332bf74',
};

const committedFile = () => parseYaml(readFileSync(WRITING_TASK_RULES_PATH, 'utf-8'));
type RulesFile = ReturnType<typeof committedFile>;

function issuesFor(change: (file: RulesFile) => void): string[] {
  const file = committedFile();
  change(file);
  return parseWritingTaskRules(file).issues;
}

const analysisTags = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH).analysisTags;

describe('writing task rules', () => {
  it('loads_the_committed_rules_file', () => {
    const { version, rules } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);

    expect(version).toBe('1');
    expect(rules.scenarios).toHaveLength(12);
    expect(Object.keys(rules.requirements)).toHaveLength(36);
  });

  it('pins_the_fingerprint_of_version_1', () => {
    const { version, fingerprint } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);
    expect(PINNED_FINGERPRINTS[version]).toBe(fingerprint);
  });

  it('rejects_a_requirement_for_a_tag_outside_the_taxonomy', () => {
    const { rules } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);
    const withExtra = { ...rules, requirements: { ...rules.requirements, 'grammar:not-a-real-tag': 'Do something.' } };
    const issues = checkRequirementsCoverage(withExtra, analysisTags);
    expect(issues.some((issue) => issue.includes('grammar:not-a-real-tag'))).toBe(true);
  });

  it('rejects_a_missing_requirement_for_an_analysis_tag', () => {
    const { rules } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);
    const missingTag = analysisTags[0]!;
    const { [missingTag]: _dropped, ...rest } = rules.requirements;
    const issues = checkRequirementsCoverage({ ...rules, requirements: rest }, analysisTags);
    expect(issues.some((issue) => issue.includes(missingTag))).toBe(true);
  });

  it('rejects_a_scenario_whose_shortest_composition_is_under_80_words', () => {
    const issues = issuesFor((file) => {
      file.scenarios[0].text = 'Too short.';
    });
    expect(issues.some((issue) => issue.includes(committedFile().scenarios[0].id) && issue.includes('under the 80-word minimum'))).toBe(
      true,
    );
  });

  it('rejects_a_scenario_whose_longest_composition_is_over_150_words', () => {
    const issues = issuesFor((file) => {
      file.scenarios[0].text = `${file.scenarios[0].text} ${'padding word '.repeat(60).trim()}`;
    });
    expect(issues.some((issue) => issue.includes('over the 150-word maximum'))).toBe(true);
  });

  it('rejects_duplicate_scenario_ids_and_too_few_scenarios', () => {
    const issues = issuesFor((file) => {
      file.scenarios = [file.scenarios[0], { ...file.scenarios[0] }];
    });
    expect(issues.some((issue) => issue.includes('is listed twice'))).toBe(true);
    expect(issues.some((issue) => issue.includes('needs at least'))).toBe(true);
  });

  it('fingerprint_is_stable_for_identical_rules', () => {
    const { rules } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);
    expect(writingTaskRulesFingerprint(rules)).toBe(writingTaskRulesFingerprint(structuredClone(rules)));
  });

  it('fingerprint_changes_with_a_requirement', () => {
    const { rules } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);
    const tag = Object.keys(rules.requirements)[0]!;
    const changed = { ...rules, requirements: { ...rules.requirements, [tag]: `${rules.requirements[tag]} Extra.` } };
    expect(writingTaskRulesFingerprint(changed)).not.toBe(writingTaskRulesFingerprint(rules));
  });

  it('refuses_to_load_a_missing_file', () => {
    expect(() => loadWritingTaskRulesFile('/no/such/file.yaml')).toThrow(WritingTaskRulesValidationError);
  });
});
