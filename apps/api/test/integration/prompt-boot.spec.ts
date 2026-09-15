import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PromptLibraryValidationError,
  PromptRegistryNotLoadedError,
  PromptRegistryService,
} from '../../src/prompts/prompt-registry.service';

const REAL_PROMPTS_DIR = join(__dirname, '..', '..', 'prompts');
const MALFORMED_FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'prompts-malformed');

describe('prompt library boot', () => {
  it('loads_all_nine_mvp_prompts_with_one_log_line_each', async () => {
    const registry = new PromptRegistryService();
    const lines: string[] = [];

    const result = await registry.loadAll(REAL_PROMPTS_DIR, (message) => lines.push(message));

    expect(result.count).toBe(9);
    expect(lines).toHaveLength(9);
    for (const line of lines) {
      expect(line).toMatch(/^Loaded prompt [a-z0-9-]+ v\S+ \(model \S+, schema OK\)$/);
    }
  });

  it('every_mvp_prompt_id_is_reachable_after_boot', async () => {
    const registry = new PromptRegistryService();
    await registry.loadAll(REAL_PROMPTS_DIR);

    for (const id of [
      'scenario-situation',
      'scenario-role-card',
      'lesson-analysis',
      'reading-generate',
      'vocabulary-generate',
      'grammar-generate',
      'error-review-generate',
      'writing-correct',
      'study-plan-compose',
    ]) {
      expect(registry.get(id).id).toBe(id);
    }
  });

  it('refuses_to_start_on_any_malformed_file', async () => {
    const registry = new PromptRegistryService();

    await expect(registry.loadAll(MALFORMED_FIXTURES_DIR)).rejects.toThrow(
      PromptLibraryValidationError,
    );
  });

  it('aggregates_issues_from_multiple_bad_files_into_one_error', async () => {
    const registry = new PromptRegistryService();

    try {
      await registry.loadAll(MALFORMED_FIXTURES_DIR);
      expect.unreachable('loadAll should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PromptLibraryValidationError);
      const message = (error as PromptLibraryValidationError).message;
      expect(message).toContain('bad-one.yaml');
      expect(message).toContain('bad-two.yaml');
    }
  });

  it('get_before_load_all_fails_distinctly_from_an_unknown_id', () => {
    const registry = new PromptRegistryService();

    expect(() => registry.get('anything')).toThrow(PromptRegistryNotLoadedError);
  });

  it('get_after_load_all_raises_prompt002_for_an_unknown_id', async () => {
    const registry = new PromptRegistryService();
    await registry.loadAll(REAL_PROMPTS_DIR);

    expect(() => registry.get('does-not-exist')).toThrow(/PROMPT002|Unknown prompt/i);
  });
});
