import type { GeneratedContentType } from '@english-quest/shared';

import type { LoadedErrorTaxonomy } from '../taxonomy/error-taxonomy';
import type { SlotSpec } from './generation.contract';
import type { GenerationRules } from './rules/generation-rules';

const COMMON_VARIABLES = [
  'topic_domain',
  'target_structures',
  'word_range',
  'sentence_length_range',
  'min_type_token_ratio',
  'min_out_of_frequency_percent',
  'min_occurrences',
] as const;

/**
 * Exactly the variables each generation prompt receives. The boot check
 * (`verify-generation-prompts.ts`) compares every prompt's declared
 * variables against this list, so the YAML and the generator cannot drift.
 * No variable carries the compact profile summary: generated items are
 * shared across participants, so prompts get tags, not the owner's history
 * (spec §1, privacy decision). Only error review sees the owner's own
 * quotes, and the gate refuses any item that reproduces them.
 */
export const GENERATION_PROMPT_VARIABLES: Readonly<Record<GeneratedContentType, readonly string[]>> = {
  reading: ['genre', ...COMMON_VARIABLES],
  vocabulary: COMMON_VARIABLES,
  grammar: COMMON_VARIABLES,
  error_review: [...COMMON_VARIABLES, 'learner_errors'],
};

/** Up to five of the tag's own ledger examples, for error review (spec A7). */
export interface LearnerError {
  quote: string;
  correction: string | null;
}

export interface PromptInput {
  variables: Record<string, string>;
  /** Every learner string the prompt carries, for the gate's `learner_quotes` check. */
  learnerQuotes: string[];
}

/** 0.12 → "12", 0.125 → "12.5". */
function percent(ratio: number): string {
  return String(Math.round(ratio * 1000) / 10);
}

/**
 * The target structures as the taxonomy names them. Its descriptions say
 * what the learner gets wrong; the templates frame them as patterns to model
 * correctly.
 */
export function renderTargetStructures(tags: readonly string[], taxonomy: LoadedErrorTaxonomy): string {
  return tags
    .map((tag) => {
      const entry = taxonomy.tags.find((candidate) => candidate.tag === tag);
      return entry ? `- ${tag} (${entry.label}): ${entry.description}` : `- ${tag}`;
    })
    .join('\n');
}

export function renderLearnerErrors(errors: readonly LearnerError[]): string {
  return errors
    .map((error) => (error.correction ? `- "${error.quote}" → "${error.correction}"` : `- "${error.quote}"`))
    .join('\n');
}

/**
 * The prompt input for one slot: thresholds rendered from the rules file
 * (spec A18), so the prompt asks for exactly what the gate will measure,
 * plus the slot's genre and topic domain and, for error review, the
 * learner's own errors on that tag.
 */
export function buildPromptVariables(
  slot: SlotSpec,
  rules: GenerationRules,
  taxonomy: LoadedErrorTaxonomy,
  learnerErrors: readonly LearnerError[] = [],
): PromptInput {
  const typeRules = rules.itemTypes[slot.type];
  const common: Record<string, string> = {
    topic_domain: slot.topicDomain,
    target_structures: renderTargetStructures(slot.targetTags, taxonomy),
    word_range: `${typeRules.words.min}–${typeRules.words.max}`,
    sentence_length_range: `${typeRules.meanSentenceLength.min}–${typeRules.meanSentenceLength.max}`,
    min_type_token_ratio: String(typeRules.minTypeTokenRatio),
    min_out_of_frequency_percent: percent(typeRules.minOutOfFrequencyRatio),
    min_occurrences: String(typeRules.minStructureOccurrences),
  };

  switch (slot.type) {
    case 'reading':
      return { variables: { ...common, genre: slot.genre ?? '' }, learnerQuotes: [] };
    case 'error_review':
      return {
        variables: { ...common, learner_errors: renderLearnerErrors(learnerErrors) },
        learnerQuotes: learnerErrors.flatMap((error) => (error.correction ? [error.quote, error.correction] : [error.quote])),
      };
    default:
      return { variables: common, learnerQuotes: [] };
  }
}
