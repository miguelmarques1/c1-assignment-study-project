import type { GeneratedContentType } from '@english-quest/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { GenerationPromptMismatchError, verifyGenerationPrompts } from '../../src/boot/verify-generation-prompts';
import { validateGeneratedInput } from '../../src/content/content-item.validation';
import { containsWholeWords, verifyTargetStructures } from '../../src/generation/gate/target-structures';
import type { GeneratedItemOutput } from '../../src/generation/generation.contract';
import { GENERATION_PROMPT_IDS } from '../../src/generation/generation.constants';
import { mapGeneratedOutput } from '../../src/generation/generated-item.mapper';
import { buildPromptVariables } from '../../src/generation/prompt-variables';
import { normalizeForMatch, normalizeQuote, words } from '../../src/generation/text/text-metrics';
import { PromptRegistryService } from '../../src/prompts/prompt-registry.service';
import type { LoadedPrompt } from '../../src/prompts/prompt-types';
import { renderUserMessage } from '../../src/prompts/template-renderer';
import { committedGateData, slotSpec } from '../fixtures/generation/fixtures';

const data = committedGateData();
const registry = new PromptRegistryService();
const TYPES = Object.keys(GENERATION_PROMPT_IDS) as GeneratedContentType[];
const FORMATS = data.rules.rules.questions.formats;

beforeAll(async () => {
  await registry.loadAll(undefined, () => undefined);
});

/** A registry whose one prompt is replaced, for the verifier's negative cases. */
function registryWith(id: string, change: (prompt: LoadedPrompt) => LoadedPrompt) {
  return {
    get: (promptId: string) => (promptId === id ? change(structuredClone(registry.get(promptId))) : registry.get(promptId)),
  } as unknown as PromptRegistryService;
}

describe('generation prompts, version 2', () => {
  it('each_generate_prompt_loads_at_version_2_or_later', () => {
    for (const id of Object.values(GENERATION_PROMPT_IDS)) {
      expect(Number(registry.get(id).version)).toBeGreaterThanOrEqual(2);
    }
  });

  it('each_generate_prompt_has_two_or_three_exemplars_that_validate', () => {
    // F04's loader has already validated every example against the response schema, or loadAll would have thrown.
    for (const id of Object.values(GENERATION_PROMPT_IDS)) {
      expect(registry.get(id).examples.length).toBeGreaterThanOrEqual(2);
      expect(registry.get(id).examples.length).toBeLessThanOrEqual(3);
    }
  });

  it('question_formats_are_limited_to_multiple_choice_and_fill_blank', () => {
    for (const id of Object.values(GENERATION_PROMPT_IDS)) {
      const schema = registry.get(id).responseSchema as {
        properties: { questions: { items: { properties: { format: { enum: string[] } } } } };
      };
      expect(schema.properties.questions.items.properties.format.enum).toEqual(['multiple_choice', 'fill_blank']);
    }
  });

  it('the_committed_prompts_pass_the_boot_verifier', () => {
    expect(() => verifyGenerationPrompts({ registry, allowedFormats: FORMATS })).not.toThrow();
  });

  it('boot_verifier_reports_variable_and_format_drift', () => {
    const missingVariable = registryWith('reading-generate', (prompt) => ({
      ...prompt,
      variables: prompt.variables.filter((variable) => variable.name !== 'genre'),
    }));
    const extraVariable = registryWith('grammar-generate', (prompt) => ({
      ...prompt,
      variables: [...prompt.variables, { name: 'learner_profile', required: false }],
    }));

    expect(() => verifyGenerationPrompts({ registry: missingVariable, allowedFormats: FORMATS })).toThrow(
      /reading-generate v2 does not declare variables the generator renders: genre/,
    );
    expect(() => verifyGenerationPrompts({ registry: extraVariable, allowedFormats: FORMATS })).toThrow(
      /grammar-generate v2 declares variables the generator never renders: learner_profile/,
    );
    expect(() => verifyGenerationPrompts({ registry, allowedFormats: ['multiple_choice'] })).toThrow(
      /allows question formats the rules do not: fill_blank/,
    );
    const noExemplars = registryWith('vocabulary-generate', (prompt) => ({ ...prompt, examples: [] }));
    expect(() => verifyGenerationPrompts({ registry: noExemplars, allowedFormats: FORMATS })).toThrow(GenerationPromptMismatchError);
  });

  it('no_generate_prompt_declares_the_compact_summary', () => {
    for (const id of Object.values(GENERATION_PROMPT_IDS)) {
      const names = registry.get(id).variables.map((variable) => variable.name);
      expect(names.some((name) => /profile|summary/.test(name))).toBe(false);
    }
  });

  it('every_prompt_renders_with_the_generator_variables', () => {
    for (const type of TYPES) {
      const slot = slotSpec({ type, targetTags: type === 'reading' ? ['grammar:conditional-3', 'discourse:hedging'] : ['grammar:passive-voice'] });
      const { variables } = buildPromptVariables(slot, data.rules.rules, data.taxonomy, [
        { quote: 'He was regard as unfit.', correction: 'He was regarded as unfit.' },
      ]);
      const message = renderUserMessage(registry.get(GENERATION_PROMPT_IDS[type]), variables, { exampleIndexes: [0] });

      expect(message).not.toMatch(/\{\{/);
      expect(message).toContain(type === 'reading' ? '450–700' : '250–450');
      expect(message).toContain('grammar:');
    }
  });

  it('exemplars_quote_their_evidence_and_occurrences_verbatim', () => {
    for (const type of TYPES) {
      const prompt = registry.get(GENERATION_PROMPT_IDS[type]);
      prompt.examples.forEach((example, index) => {
        const output = example.output as GeneratedItemOutput;
        const label = `${prompt.id} example ${index}`;
        const tags = [...new Set(output.target_occurrences.map((occurrence) => occurrence.tag))];

        expect(words(output.body).length, `${label} is a short exemplar`).toBeLessThanOrEqual(150);
        const mapped = mapGeneratedOutput(output, slotSpec({ type, targetTags: tags }), { promptId: prompt.id, promptVersion: prompt.version }, data.rules.rules, data.taxonomy);
        expect(validateGeneratedInput({ ...mapped.input, gateMetrics: { exemplar: true } }, data.taxonomy).ok, label).toBe(true);

        const body = normalizeForMatch(output.body);
        for (const question of output.questions) {
          expect(containsWholeWords(body, normalizeQuote(question.evidence)), `${label}: ${question.evidence}`).toBe(true);
        }
        const structures = verifyTargetStructures(output.body, tags, output.target_occurrences, data.rules.markers);
        for (const [tag, report] of Object.entries(structures)) {
          expect(report.rejected, `${label} ${tag}`).toEqual([]);
        }
      });
    }
  });
});
