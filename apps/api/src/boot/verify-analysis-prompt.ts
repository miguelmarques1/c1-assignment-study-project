import type { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import type { PromptRegistryService } from '../prompts/prompt-registry.service';

/** Thrown at boot when the prompt's tag `enum`s and the taxonomy's analysis tags disagree. */
export class AnalysisTaxonomyMismatchError extends Error {
  override readonly name = 'AnalysisTaxonomyMismatchError';
  constructor(public readonly issues: string[]) {
    super(`lesson-analysis prompt and error taxonomy disagree:\n  ${issues.join('\n  ')}`);
  }
}

interface JsonSchemaWithEnum {
  enum?: string[];
}

function enumAt(schema: unknown, path: readonly string[]): string[] {
  let node = schema as Record<string, unknown> | undefined;
  for (const key of path) {
    node = node?.[key] as Record<string, unknown> | undefined;
  }
  return ((node as JsonSchemaWithEnum | undefined)?.enum ?? []).slice();
}

function diff(expected: string[], actual: string[], label: string): string[] {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((tag) => !actualSet.has(tag));
  const extra = actual.filter((tag) => !expectedSet.has(tag));
  const issues: string[] = [];
  if (missing.length > 0) {
    issues.push(`${label} is missing: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    issues.push(`${label} has tags outside the taxonomy: ${extra.join(', ')}`);
  }
  return issues;
}

export interface VerifyAnalysisPromptOptions {
  registry: PromptRegistryService;
  taxonomy: ErrorTaxonomyService;
}

/**
 * F04 fixed that the error taxonomy is an `enum` inside `lesson-analysis`'s
 * `response_schema` — the mechanism F11's "a tag outside the taxonomy fails
 * validation" criterion relies on. This makes the two impossible to ship out
 * of step: the prompt's `errors[].tag` and `recurring_tags[]` enums must
 * name exactly the taxonomy's `analysis: true` tags, in either order.
 */
export function verifyAnalysisPrompt(options: VerifyAnalysisPromptOptions): void {
  const { registry, taxonomy } = options;
  const prompt = registry.get('lesson-analysis');
  const analysisTags = taxonomy.current().analysisTags;

  const errorTagEnum = enumAt(prompt.responseSchema, ['properties', 'errors', 'items', 'properties', 'tag']);
  const recurringTagEnum = enumAt(prompt.responseSchema, ['properties', 'recurring_tags', 'items']);

  const issues = [
    ...diff(analysisTags, errorTagEnum, "lesson-analysis's errors[].tag enum"),
    ...diff(analysisTags, recurringTagEnum, "lesson-analysis's recurring_tags[] enum"),
  ];

  if (issues.length > 0) {
    throw new AnalysisTaxonomyMismatchError(issues);
  }
}
