import type { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import type { PromptRegistryService } from '../prompts/prompt-registry.service';

/** The exact variable set `correction-prompt-variables.ts` renders. */
const EXPECTED_VARIABLES = ['task_statement', 'target_structures', 'submission', 'taxonomy'] as const;

const REQUIRED_SCORE_KEYS = ['grammar', 'vocabulary', 'coherence', 'task_achievement'] as const;

/** Thrown at boot when `writing-correct` and the taxonomy, or the correction builder, disagree. */
export class WritingPromptMismatchError extends Error {
  override readonly name = 'WritingPromptMismatchError';
  constructor(public readonly issues: string[]) {
    super(`Writing prompt and correction builder disagree:\n  ${issues.join('\n  ')}`);
  }
}

function propertyAt(schema: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  let node = schema as Record<string, unknown> | undefined;
  for (const key of path) {
    node = node?.[key] as Record<string, unknown> | undefined;
  }
  return node;
}

export interface VerifyWritingPromptOptions {
  registry: PromptRegistryService;
  taxonomy: ErrorTaxonomyService;
}

/**
 * Pins `writing-correct`'s shape against what
 * `correction-prompt-variables.ts` renders and the taxonomy in force (spec
 * A23): the variable set matches exactly, `errors[].tag`'s `enum` is
 * exactly the taxonomy's analysis tags, `scores` requires exactly its four
 * keys, `errors` declares no `maxItems` (F11's live finding that Gemini
 * rejects one over this taxonomy's mixed `:`/`-` enum), and at least one
 * example exists. Mirrors `verify-analysis-prompt.ts` and `verify-plan-prompt.ts`.
 */
export function verifyWritingPrompt(options: VerifyWritingPromptOptions): void {
  const { registry, taxonomy } = options;
  const prompt = registry.get('writing-correct');
  const issues: string[] = [];

  const declared = new Set(prompt.variables.map((variable) => variable.name));
  const expected = new Set<string>(EXPECTED_VARIABLES);
  for (const name of expected) {
    if (!declared.has(name)) {
      issues.push(`writing-correct is missing the "${name}" variable the correction builder renders`);
    }
  }
  for (const name of declared) {
    if (!expected.has(name)) {
      issues.push(`writing-correct declares an unexpected variable "${name}"`);
    }
  }

  const analysisTags = taxonomy.current().analysisTags;
  const tagProperty = propertyAt(prompt.responseSchema, ['properties', 'errors', 'items', 'properties', 'tag']);
  const tagEnum = (tagProperty?.enum as string[] | undefined) ?? [];
  const tagEnumSet = new Set(tagEnum);
  const analysisTagSet = new Set(analysisTags);
  const missingTags = analysisTags.filter((tag) => !tagEnumSet.has(tag));
  const extraTags = tagEnum.filter((tag) => !analysisTagSet.has(tag));
  if (missingTags.length > 0) {
    issues.push(`writing-correct's errors[].tag enum is missing: ${missingTags.join(', ')}`);
  }
  if (extraTags.length > 0) {
    issues.push(`writing-correct's errors[].tag enum has tags outside the taxonomy: ${extraTags.join(', ')}`);
  }

  const errorsProperty = propertyAt(prompt.responseSchema, ['properties', 'errors']);
  if (errorsProperty && 'maxItems' in errorsProperty) {
    issues.push('writing-correct declares maxItems on errors[], which this taxonomy’s enum cannot carry (F11’s live finding)');
  }

  const scoresProperty = propertyAt(prompt.responseSchema, ['properties', 'scores']);
  const scoresRequired = new Set((scoresProperty?.required as string[] | undefined) ?? []);
  for (const key of REQUIRED_SCORE_KEYS) {
    if (!scoresRequired.has(key)) {
      issues.push(`writing-correct's scores is missing the required key "${key}"`);
    }
  }
  for (const key of scoresRequired) {
    if (!(REQUIRED_SCORE_KEYS as readonly string[]).includes(key)) {
      issues.push(`writing-correct's scores requires an unexpected key "${key}"`);
    }
  }

  if (prompt.examples.length === 0) {
    issues.push('writing-correct has no examples');
  }

  if (issues.length > 0) {
    throw new WritingPromptMismatchError(issues);
  }
}
