import type { ContentSkill, GeneratedContentType, GeneratedItemInput } from '@english-quest/shared';

import type { LoadedErrorTaxonomy } from '../taxonomy/error-taxonomy';
import type { ModelOccurrence, ModelQuestion, SlotSpec } from './generation.contract';
import type { GenerationRules } from './rules/generation-rules';

/** Generation always targets C1 (spec A12); F16's ratings tune the prompts, not a per-user level. */
export const GENERATED_CEFR_LEVEL = 'C1';

export interface PromptStamp {
  promptId: string;
  promptVersion: string;
}

/** The bank input minus the metrics, which the gate adds once it has measured. */
export type MappedItemInput = Omit<GeneratedItemInput, 'gateMetrics'>;

export interface MappedItem {
  /** Unvalidated: the gate runs F13's own validation on it. */
  input: MappedItemInput;
  /** The model's questions as returned, for the format and evidence checks. */
  modelQuestions: ModelQuestion[];
  occurrences: ModelOccurrence[];
}

/** `gen-<type>-<first 12 hex characters of the slot id>` (spec A13): one slug per slot, so a resumed slot updates its own item. */
export function generatedSlug(type: GeneratedContentType, slotId: string): string {
  return `gen-${type.replace(/_/g, '-')}-${slotId.replace(/-/g, '').slice(0, 12).toLowerCase()}`;
}

const FAMILY_SKILL: Record<string, ContentSkill> = { grammar: 'grammar', vocab: 'vocabulary' };

/**
 * The item's skills (spec A12): its own type's skill, the skills its tag
 * families train, and `reading` for every text-based type other than
 * reading itself. Error review has no skill of its own.
 */
export function skillsFor(type: GeneratedContentType, targetTags: readonly string[], taxonomy: LoadedErrorTaxonomy): ContentSkill[] {
  const familySkills = targetTags.flatMap((tag) => {
    const skill = FAMILY_SKILL[taxonomy.familyOf.get(tag) ?? ''];
    return skill ? [skill] : [];
  });
  const ordered: ContentSkill[] =
    type === 'error_review' ? [...familySkills, 'reading'] : [type, ...familySkills, 'reading'];
  return [...new Set(ordered)];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function readQuestion(raw: unknown): ModelQuestion {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    format: asString(value.format),
    prompt: asString(value.prompt),
    options: asStrings(value.options),
    answer: typeof value.answer === 'string' ? value.answer : undefined,
    accepted_answers: asStrings(value.accepted_answers),
    explanation: asString(value.explanation),
    evidence: asString(value.evidence),
  };
}

/**
 * F13's question union from the flat question. Missing fields are passed
 * through as absent so that F13's validation names them, rather than this
 * mapper throwing: a malformed question is a gate failure worth one
 * regeneration, not a crash.
 */
function toBankQuestion(question: ModelQuestion): unknown {
  const common = { format: question.format, prompt: question.prompt, explanation: question.explanation };
  switch (question.format) {
    case 'multiple_choice':
      return { ...common, options: question.options, answer: question.answer };
    case 'fill_blank':
      return { ...common, answer: question.accepted_answers };
    default:
      return common;
  }
}

/**
 * Converts a generation prompt's output into F13's generated-item input
 * (spec A11–A13). The target tags are the slot's, never the model's; the
 * evidence and the occurrence list are kept aside for the gate and never
 * reach the stored questions, which F13 validates strictly.
 */
export function mapGeneratedOutput(
  output: unknown,
  slot: SlotSpec,
  stamp: PromptStamp,
  rules: GenerationRules,
  taxonomy: LoadedErrorTaxonomy,
): MappedItem {
  const value = (output ?? {}) as Record<string, unknown>;
  const modelQuestions = Array.isArray(value.questions) ? value.questions.map(readQuestion) : [];
  const occurrences = Array.isArray(value.target_occurrences)
    ? value.target_occurrences.flatMap((raw): ModelOccurrence[] => {
        const entry = (raw ?? {}) as Record<string, unknown>;
        return typeof entry.tag === 'string' && typeof entry.quote === 'string' ? [{ tag: entry.tag, quote: entry.quote }] : [];
      })
    : [];

  return {
    input: {
      slug: generatedSlug(slot.type, slot.slotId),
      type: slot.type,
      cefrLevel: GENERATED_CEFR_LEVEL,
      title: asString(value.title),
      topic: asString(value.topic),
      skills: skillsFor(slot.type, slot.targetTags, taxonomy),
      difficulty: rules.itemTypes[slot.type].difficulty,
      body: asString(value.body),
      questions: modelQuestions.map(toBankQuestion) as MappedItemInput['questions'],
      targetTags: [...slot.targetTags],
      promptId: stamp.promptId,
      promptVersion: stamp.promptVersion,
    },
    modelQuestions,
    occurrences,
  };
}
