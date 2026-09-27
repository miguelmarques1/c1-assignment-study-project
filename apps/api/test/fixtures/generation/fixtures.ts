import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GeneratedContentType } from '@english-quest/shared';

import type { GeneratedItemOutput, SlotSpec } from '../../../src/generation/generation.contract';
import { GENERATION_RULES_PATH, FREQUENCY_LIST_PATH } from '../../../src/generation/generation.constants';
import { loadGenerationRulesFile } from '../../../src/generation/rules/generation-rules';
import { loadFrequencyListFile } from '../../../src/generation/text/frequency-list';
import { loadErrorTaxonomyFile } from '../../../src/taxonomy/error-taxonomy';
import { ERROR_TAXONOMY_PATH } from '../../../src/taxonomy/error-taxonomy.constants';

/**
 * Hand-written passages that pass the gate against the committed frequency
 * list. Each lists occurrences for several tags, so one passage serves
 * every slot whose tags it covers:
 * - `reading-library-letter` (a reading, 491 words): grammar:conditional-3,
 *   discourse:hedging, grammar:passive-voice, discourse:connector,
 *   vocab:collocation, grammar:present-perfect
 * - `short-museum-labels` (grammar, vocabulary or error review, 278 words):
 *   grammar:passive-voice, vocab:collocation, grammar:article-definite,
 *   grammar:conditional-3, discourse:connector, grammar:present-perfect
 */
export type FixtureName = 'reading-library-letter' | 'short-museum-labels';

export const READING_FIXTURE_TAGS = [
  'grammar:conditional-3',
  'discourse:hedging',
  'grammar:passive-voice',
  'discourse:connector',
  'vocab:collocation',
  'grammar:present-perfect',
] as const;

export const SHORT_FIXTURE_TAGS = [
  'grammar:passive-voice',
  'vocab:collocation',
  'grammar:article-definite',
  'grammar:conditional-3',
  'discourse:connector',
  'grammar:present-perfect',
] as const;

export function loadFixture(name: FixtureName): GeneratedItemOutput {
  return JSON.parse(readFileSync(join(__dirname, `${name}.json`), 'utf-8')) as GeneratedItemOutput;
}

/** The passage that fits a type: the reading for readings, the short one otherwise. */
export function fixtureFor(type: GeneratedContentType): GeneratedItemOutput {
  return loadFixture(type === 'reading' ? 'reading-library-letter' : 'short-museum-labels');
}

/**
 * A model response for a slot: the passage for its type, with only the
 * occurrences of the slot's own tags, as a model asked for those tags
 * would return.
 */
export function responseForSlot(type: GeneratedContentType, targetTags: readonly string[]): GeneratedItemOutput {
  const fixture = fixtureFor(type);
  return { ...fixture, target_occurrences: fixture.target_occurrences.filter((entry) => targetTags.includes(entry.tag)) };
}

export function slotSpec(overrides: Partial<SlotSpec> = {}): SlotSpec {
  const type = overrides.type ?? 'reading';
  return {
    slotId: '3f2a9c1e-0b7d-4e5f-8a61-0b2c3d4e5f60',
    type,
    targetTags: type === 'reading' ? ['grammar:conditional-3', 'discourse:hedging'] : ['grammar:passive-voice'],
    attempt: 1,
    genre: type === 'reading' ? 'letter to the editor' : null,
    topicDomain: 'housing',
    exemplarIndex: 0,
    ...overrides,
  };
}

/** The committed taxonomy, rules and frequency list, loaded the way the services load them. */
export function committedGateData() {
  const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
  return {
    taxonomy,
    rules: loadGenerationRulesFile(GENERATION_RULES_PATH, taxonomy),
    frequencyList: loadFrequencyListFile(FREQUENCY_LIST_PATH),
  };
}
