import type { GeneratedContentType } from '@english-quest/shared';

import { GENERATION_PROMPT_IDS } from '../generation/generation.constants';
import { GENERATION_PROMPT_VARIABLES } from '../generation/prompt-variables';
import type { PromptRegistryService } from '../prompts/prompt-registry.service';
import type { LoadedPrompt } from '../prompts/prompt-types';

/** The PRD's "two to three short authentic style exemplars" per prompt. */
const MIN_EXEMPLARS = 2;
const MAX_EXEMPLARS = 3;

/** Thrown at boot when a generation prompt and the generator that renders and reads it disagree. */
export class GenerationPromptMismatchError extends Error {
  override readonly name = 'GenerationPromptMismatchError';
  constructor(readonly issues: string[]) {
    super(`Generation prompts and generator disagree:\n  ${issues.join('\n  ')}`);
  }
}

type SchemaNode = { properties?: Record<string, SchemaNode>; items?: SchemaNode; enum?: unknown[] } | undefined;

function at(schema: unknown, path: readonly string[]): SchemaNode {
  let node = schema as SchemaNode;
  for (const key of path) {
    node = key === 'items' ? node?.items : node?.properties?.[key];
  }
  return node;
}

function promptIssues(type: GeneratedContentType, prompt: LoadedPrompt, allowedFormats: readonly string[]): string[] {
  const label = `${prompt.id} v${prompt.version}`;
  const issues: string[] = [];

  const declared = prompt.variables.map((variable) => variable.name).sort();
  const expected = [...GENERATION_PROMPT_VARIABLES[type]].sort();
  const missing = expected.filter((name) => !declared.includes(name));
  const extra = declared.filter((name) => !expected.includes(name));
  if (missing.length > 0) {
    issues.push(`${label} does not declare variables the generator renders: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    issues.push(`${label} declares variables the generator never renders: ${extra.join(', ')}`);
  }

  if (prompt.examples.length < MIN_EXEMPLARS || prompt.examples.length > MAX_EXEMPLARS) {
    issues.push(`${label} has ${prompt.examples.length} style exemplars; ${MIN_EXEMPLARS} to ${MAX_EXEMPLARS} are required`);
  }

  const formats = at(prompt.responseSchema, ['questions', 'items', 'format'])?.enum;
  if (!Array.isArray(formats) || formats.length === 0) {
    issues.push(`${label} does not constrain questions[].format with an enum`);
  } else {
    const outside = formats.filter((format) => !allowedFormats.includes(String(format)));
    if (outside.length > 0) {
      issues.push(`${label} allows question formats the rules do not: ${outside.join(', ')}`);
    }
  }

  const required: Array<[string, readonly string[]]> = [
    ['questions[].evidence', ['questions', 'items', 'evidence']],
    ['questions[].accepted_answers', ['questions', 'items', 'accepted_answers']],
    ['target_occurrences[].quote', ['target_occurrences', 'items', 'quote']],
    ['target_occurrences[].tag', ['target_occurrences', 'items', 'tag']],
  ];
  for (const [name, path] of required) {
    if (!at(prompt.responseSchema, path)) {
      issues.push(`${label} response_schema has no ${name}, which the difficulty gate reads`);
    }
  }
  return issues;
}

export interface VerifyGenerationPromptsOptions {
  registry: PromptRegistryService;
  /** The question formats the rules in force allow (`questions.formats`). */
  allowedFormats: readonly string[];
}

/**
 * F14's generator renders a fixed set of variables per item type and reads
 * `evidence` and `target_occurrences` back from each answer. This makes the
 * YAML and the code impossible to ship out of step: a missing or extra
 * variable, a question format the rules do not allow, a missing gate field,
 * or a number of style exemplars outside 2–3 refuses the boot, the way
 * `verify-analysis-prompt.ts` guards F11's taxonomy enum.
 */
export function verifyGenerationPrompts(options: VerifyGenerationPromptsOptions): void {
  const issues = (Object.entries(GENERATION_PROMPT_IDS) as Array<[GeneratedContentType, string]>).flatMap(([type, id]) =>
    promptIssues(type, options.registry.get(id), options.allowedFormats),
  );
  if (issues.length > 0) {
    throw new GenerationPromptMismatchError(issues);
  }
}
