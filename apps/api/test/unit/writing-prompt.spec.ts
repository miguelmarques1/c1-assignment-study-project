import { beforeAll, describe, expect, it } from 'vitest';

import { WritingPromptMismatchError, verifyWritingPrompt } from '../../src/boot/verify-writing-prompt';
import { buildCorrectionPromptVariables } from '../../src/writing/correction/correction-prompt-variables';
import { PromptRegistryService } from '../../src/prompts/prompt-registry.service';
import type { LoadedPrompt } from '../../src/prompts/prompt-types';
import { ErrorTaxonomyService } from '../../src/taxonomy/error-taxonomy.service';

const registry = new PromptRegistryService();
const taxonomy = new ErrorTaxonomyService();

beforeAll(async () => {
  await registry.loadAll(undefined, () => undefined);
  taxonomy.load();
});

function registryWith(id: string, change: (prompt: LoadedPrompt) => LoadedPrompt) {
  return {
    get: (promptId: string) => (promptId === id ? change(structuredClone(registry.get(promptId))) : registry.get(promptId)),
  } as unknown as PromptRegistryService;
}

function fakeTaxonomyWith(analysisTags: string[]) {
  return { current: () => ({ ...taxonomy.current(), analysisTags }) } as unknown as ErrorTaxonomyService;
}

describe('writing-correct prompt, version 2', () => {
  it('writing_correct_v2_loads_and_its_examples_validate', () => {
    const prompt = registry.get('writing-correct');
    expect(prompt.version).toBe('2');
    expect(prompt.examples.length).toBeGreaterThanOrEqual(1);
  });

  it('declares_exactly_the_variables_the_correction_builder_renders', () => {
    const rendered = Object.keys(
      buildCorrectionPromptVariables({
        taskStatement: 'x',
        targetTags: [],
        submittedText: 'y',
        analysisTags: [],
      }),
    );
    const declared = registry.get('writing-correct').variables.map((v) => v.name).sort();
    expect(declared).toEqual([...rendered].sort());
  });

  it('the_boot_check_passes_on_the_committed_prompt', () => {
    expect(() => verifyWritingPrompt({ registry, taxonomy })).not.toThrow();
  });

  it('the_boot_check_rejects_a_tag_enum_that_differs_from_the_taxonomy', () => {
    expect(() => verifyWritingPrompt({ registry, taxonomy: fakeTaxonomyWith(['grammar:not-a-real-tag']) })).toThrow(
      WritingPromptMismatchError,
    );
  });

  it('the_boot_check_rejects_an_unexpected_or_missing_variable', () => {
    const missing = registryWith('writing-correct', (prompt) => ({
      ...prompt,
      variables: prompt.variables.filter((v) => v.name !== 'submission'),
    }));
    expect(() => verifyWritingPrompt({ registry: missing, taxonomy })).toThrow(WritingPromptMismatchError);

    const extra = registryWith('writing-correct', (prompt) => ({
      ...prompt,
      variables: [...prompt.variables, { name: 'something_else', required: false }],
    }));
    expect(() => verifyWritingPrompt({ registry: extra, taxonomy })).toThrow(WritingPromptMismatchError);
  });

  it('the_boot_check_rejects_a_missing_score_key', () => {
    const broken = registryWith('writing-correct', (prompt) => ({
      ...prompt,
      responseSchema: {
        ...(prompt.responseSchema as Record<string, unknown>),
        properties: {
          ...(prompt.responseSchema as { properties: Record<string, unknown> }).properties,
          scores: { type: 'object', required: ['grammar', 'vocabulary', 'coherence'] },
        },
      },
    }));
    expect(() => verifyWritingPrompt({ registry: broken, taxonomy })).toThrow(WritingPromptMismatchError);
  });

  it('the_boot_check_rejects_max_items_on_errors', () => {
    const broken = registryWith('writing-correct', (prompt) => {
      const schema = structuredClone(prompt.responseSchema) as { properties: { errors: Record<string, unknown> } };
      schema.properties.errors.maxItems = 30;
      return { ...prompt, responseSchema: schema };
    });
    expect(() => verifyWritingPrompt({ registry: broken, taxonomy })).toThrow(WritingPromptMismatchError);
  });
});
