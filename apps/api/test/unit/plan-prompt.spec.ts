import { beforeAll, describe, expect, it } from 'vitest';

import { PlanPromptMismatchError, verifyPlanPrompt } from '../../src/boot/verify-plan-prompt';
import { buildComposePromptVariables } from '../../src/plans/compose-prompt-variables';
import { PromptRegistryService } from '../../src/prompts/prompt-registry.service';
import type { LoadedPrompt } from '../../src/prompts/prompt-types';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

const registry = new PromptRegistryService();
const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

beforeAll(async () => {
  await registry.loadAll(undefined, () => undefined);
});

function registryWith(id: string, change: (prompt: LoadedPrompt) => LoadedPrompt) {
  return {
    get: (promptId: string) => (promptId === id ? change(structuredClone(registry.get(promptId))) : registry.get(promptId)),
  } as unknown as PromptRegistryService;
}

describe('study-plan-compose prompt, version 2', () => {
  it('loads_at_version_2_or_later', () => {
    expect(Number(registry.get('study-plan-compose').version)).toBeGreaterThanOrEqual(2);
  });

  it('declares_exactly_the_variables_the_composer_renders', () => {
    const rendered = Object.keys(
      buildComposePromptVariables({
        profileSummary: 'x',
        tagPriority: new Map(),
        labelOf: (tag) => tag,
        offer: [],
        rules,
      }),
    );
    const declared = registry.get('study-plan-compose').variables.map((v) => v.name).sort();
    expect(declared).toEqual([...rendered].sort());
  });

  it('the_committed_prompt_passes_the_boot_verifier', () => {
    expect(() => verifyPlanPrompt({ registry })).not.toThrow();
  });

  it('has_at_least_one_example', () => {
    expect(registry.get('study-plan-compose').examples.length).toBeGreaterThanOrEqual(1);
  });

  it('response_schema_exposes_ref_and_rationale', () => {
    const schema = registry.get('study-plan-compose').responseSchema as {
      properties: { selections: { items: { properties: { ref: unknown; rationale: unknown } } } };
    };
    expect(schema.properties.selections.items.properties.ref).toBeDefined();
    expect(schema.properties.selections.items.properties.rationale).toBeDefined();
  });

  it('rejects_a_prompt_missing_a_variable_the_composer_needs', () => {
    const missing = registryWith('study-plan-compose', (prompt) => ({
      ...prompt,
      variables: prompt.variables.filter((v) => v.name !== 'review_tags'),
    }));
    expect(() => verifyPlanPrompt({ registry: missing })).toThrow(PlanPromptMismatchError);
  });

  it('rejects_a_prompt_declaring_an_unexpected_variable', () => {
    const extra = registryWith('study-plan-compose', (prompt) => ({
      ...prompt,
      variables: [...prompt.variables, { name: 'something_else', required: false }],
    }));
    expect(() => verifyPlanPrompt({ registry: extra })).toThrow(PlanPromptMismatchError);
  });

  it('rejects_a_response_schema_missing_ref_or_rationale', () => {
    const broken = registryWith('study-plan-compose', (prompt) => ({
      ...prompt,
      responseSchema: { properties: { selections: { items: { properties: { ref: { type: 'string' } } } } } },
    }));
    expect(() => verifyPlanPrompt({ registry: broken })).toThrow(PlanPromptMismatchError);
  });

  it('rejects_a_prompt_with_no_examples', () => {
    const noExamples = registryWith('study-plan-compose', (prompt) => ({ ...prompt, examples: [] }));
    expect(() => verifyPlanPrompt({ registry: noExamples })).toThrow(PlanPromptMismatchError);
  });
});
