import type { PromptRegistryService } from '../prompts/prompt-registry.service';

/** The exact variable set `compose-prompt-variables.ts` renders. */
const EXPECTED_VARIABLES = ['profile_summary', 'focus_tags', 'review_tags', 'candidates', 'selection_range'] as const;

/** Thrown at boot when `study-plan-compose` and the composer that calls it disagree. */
export class PlanPromptMismatchError extends Error {
  override readonly name = 'PlanPromptMismatchError';
  constructor(public readonly issues: string[]) {
    super(`Study plan prompt and composer disagree:\n  ${issues.join('\n  ')}`);
  }
}

function propertiesOf(schema: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  let node = schema as Record<string, unknown> | undefined;
  for (const key of path) {
    node = node?.[key] as Record<string, unknown> | undefined;
  }
  return node as Record<string, unknown> | undefined;
}

export interface VerifyPlanPromptOptions {
  registry: PromptRegistryService;
}

/**
 * Pins `study-plan-compose`'s shape against what `compose-prompt-variables.ts`
 * renders and what `model-selection.ts` reads back: the variable set matches
 * exactly, the response schema exposes `selections[].ref` and
 * `selections[].rationale`, and at least one example exists to teach the
 * shape. Mirrors `verify-analysis-prompt.ts` and `verify-generation-prompts.ts`.
 */
export function verifyPlanPrompt(options: VerifyPlanPromptOptions): void {
  const prompt = options.registry.get('study-plan-compose');
  const issues: string[] = [];

  const declared = new Set(prompt.variables.map((variable) => variable.name));
  const expected = new Set(EXPECTED_VARIABLES);
  for (const name of expected) {
    if (!declared.has(name)) {
      issues.push(`study-plan-compose is missing the "${name}" variable the composer renders`);
    }
  }
  for (const name of declared) {
    if (!expected.has(name as (typeof EXPECTED_VARIABLES)[number])) {
      issues.push(`study-plan-compose declares an unexpected variable "${name}"`);
    }
  }

  const selectionItems = propertiesOf(prompt.responseSchema, ['properties', 'selections', 'items', 'properties']);
  if (!selectionItems || !('ref' in selectionItems)) {
    issues.push('study-plan-compose response_schema is missing selections[].ref');
  }
  if (!selectionItems || !('rationale' in selectionItems)) {
    issues.push('study-plan-compose response_schema is missing selections[].rationale');
  }

  if (prompt.examples.length === 0) {
    issues.push('study-plan-compose has no examples');
  }

  if (issues.length > 0) {
    throw new PlanPromptMismatchError(issues);
  }
}
