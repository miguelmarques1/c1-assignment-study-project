import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The boot refusals, through Nest's own module initialisation: the
 * frequency list and the rules load in `onModuleInit`, so a missing or
 * invalid file rejects `init()` exactly as it stops `NestFactory.create` in
 * `main.ts`. The default paths are swapped per test with `vi.doMock`, since
 * the services read them from the constants module.
 */

const PRD_MESSAGE = 'Frequency list not found — the difficulty gate cannot run.';
const API_ROOT = join(__dirname, '..', '..');
const tempDir = mkdtempSync(join(tmpdir(), 'f14-boot-'));

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));
afterEach(() => {
  vi.doUnmock('../../src/generation/generation.constants');
  vi.resetModules();
});

async function initGeneration(paths: { frequency?: string; rules?: string } = {}) {
  vi.resetModules();
  vi.doMock('../../src/generation/generation.constants', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../src/generation/generation.constants')>()),
    ...(paths.frequency ? { FREQUENCY_LIST_PATH: paths.frequency } : {}),
    ...(paths.rules ? { GENERATION_RULES_PATH: paths.rules } : {}),
  }));
  const { Test } = await import('@nestjs/testing');
  const { TaxonomyModule } = await import('../../src/taxonomy/taxonomy.module');
  const { FrequencyListService } = await import('../../src/generation/frequency-list.service');
  const { GenerationRulesService } = await import('../../src/generation/generation-rules.service');
  const moduleRef = await Test.createTestingModule({
    imports: [TaxonomyModule],
    providers: [FrequencyListService, GenerationRulesService],
  }).compile();
  await moduleRef.init();
  return {
    frequency: moduleRef.get(FrequencyListService).current(),
    rules: moduleRef.get(GenerationRulesService).current(),
    close: () => moduleRef.close(),
  };
}

describe('generation boot', () => {
  it('refuses_to_initialise_when_the_frequency_list_is_missing', async () => {
    const error = await initGeneration({ frequency: join(tempDir, 'missing.tsv') }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(PRD_MESSAGE);
  });

  it('refuses_to_initialise_on_an_invalid_rules_file', async () => {
    const committed = readFileSync(join(API_ROOT, 'rules', 'content-generation.yaml'), 'utf-8');
    const broken = join(tempDir, 'content-generation.yaml');
    writeFileSync(broken, committed.replace('frequency_rank_cutoff: 3000', 'frequency_rank_cutoff: 9000'));

    const error = await initGeneration({ rules: broken }).catch((caught: unknown) => caught);

    expect((error as Error).message).toMatch(/^Invalid content generation rules:/);
    expect((error as Error).message).toMatch(/content-generation\.yaml: frequency_rank_cutoff/);
  });

  it('refuses_to_boot_when_a_generate_prompt_drifts', async () => {
    const prompts = join(tempDir, 'prompts');
    cpSync(join(API_ROOT, 'prompts'), prompts, { recursive: true });
    const readingPath = join(prompts, 'reading-generate.yaml');
    writeFileSync(
      readingPath,
      readFileSync(readingPath, 'utf-8').replace('enum: [multiple_choice, fill_blank]', 'enum: [multiple_choice, fill_blank, ordering]'),
    );
    const { PromptRegistryService } = await import('../../src/prompts/prompt-registry.service');
    const { verifyGenerationPrompts } = await import('../../src/boot/verify-generation-prompts');
    const registry = new PromptRegistryService();
    await registry.loadAll(prompts, () => undefined);

    expect(() => verifyGenerationPrompts({ registry, allowedFormats: ['multiple_choice', 'fill_blank'] })).toThrow(
      /reading-generate v2 allows question formats the rules do not: ordering/,
    );
  });

  it('boots_with_the_committed_files', async () => {
    const booted = await initGeneration();

    expect(booted.frequency.size).toBe(5000);
    expect(booted.frequency.version).toMatch(/^en-lemmas-top5000@[0-9a-f]{12}$/);
    expect(booted.rules.version).toBe('1');
    await booted.close();
  });
});
