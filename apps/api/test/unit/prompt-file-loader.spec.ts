import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadPromptFile } from '../../src/prompts/prompt-file-loader';

const FIXTURES = join(__dirname, '..', 'fixtures', 'prompts-cases');
const fixture = (name: string) => join(FIXTURES, `${name}.yaml`);

describe('loadPromptFile', () => {
  it('loads_a_well_formed_prompt', () => {
    const { prompt, issues } = loadPromptFile(fixture('well-formed'));

    expect(issues).toEqual([]);
    expect(prompt).not.toBeNull();
    expect(prompt?.id).toBe('well-formed');
    expect(prompt?.version).toBe('1');
    expect(prompt?.model).toBe('gemini-3.6-flash');
    expect(prompt?.variables).toEqual([{ name: 'name', required: true }]);
  });

  it('rejects_a_filename_that_does_not_match_its_id', () => {
    const { prompt, issues } = loadPromptFile(fixture('filename-mismatch'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('filename-mismatch.yaml'))).toBe(true);
    expect(issues.some((issue) => issue.includes('a-completely-different-id'))).toBe(true);
  });

  it('rejects_an_unknown_top_level_field', () => {
    const { prompt, issues } = loadPromptFile(fixture('unknown-field'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('unknown-field.yaml'))).toBe(true);
  });

  it('rejects_a_missing_required_field', () => {
    const { prompt, issues } = loadPromptFile(fixture('missing-required-field'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('missing-required-field.yaml'))).toBe(true);
    expect(issues.some((issue) => issue.includes('system'))).toBe(true);
  });

  it('rejects_an_invalid_response_schema', () => {
    const { prompt, issues } = loadPromptFile(fixture('bad-response-schema'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('bad-response-schema.yaml'))).toBe(true);
    expect(issues.some((issue) => issue.includes('response_schema'))).toBe(true);
  });

  it('rejects_a_user_template_variable_not_declared_in_variables', () => {
    const { prompt, issues } = loadPromptFile(fixture('undeclared-variable'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('{{city}}'))).toBe(true);
  });

  it('rejects_a_declared_variable_never_used_in_the_template', () => {
    const { prompt, issues } = loadPromptFile(fixture('unused-variable'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('"name"') && issue.includes('never used'))).toBe(
      true,
    );
  });

  it('rejects_an_example_whose_output_violates_the_response_schema', () => {
    const { prompt, issues } = loadPromptFile(fixture('bad-example'));

    expect(prompt).toBeNull();
    expect(issues.some((issue) => issue.includes('examples[0]'))).toBe(true);
  });

  it('never_throws_for_a_single_file_load', () => {
    for (const name of [
      'filename-mismatch',
      'unknown-field',
      'missing-required-field',
      'bad-response-schema',
      'undeclared-variable',
      'unused-variable',
      'bad-example',
    ]) {
      expect(() => loadPromptFile(fixture(name))).not.toThrow();
    }
  });
});
