import type { LoadedPrompt, PromptExample, PromptExecutionOptions } from './prompt-types';

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** A caller bug (wrong or incomplete variables), not a runtime condition to branch on. */
export class MissingRequiredVariableError extends Error {
  constructor(
    public readonly variableName: string,
    public readonly promptId: string,
  ) {
    super(`Prompt "${promptId}" requires a non-empty value for variable "${variableName}".`);
    this.name = 'MissingRequiredVariableError';
  }
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => values[name] ?? '');
}

/** A caller asked for an example the prompt does not have: a code bug, like a missing variable. */
export class InvalidExampleSelectionError extends Error {
  constructor(
    public readonly index: number,
    public readonly promptId: string,
    public readonly exampleCount: number,
  ) {
    super(`Prompt "${promptId}" has ${exampleCount} examples; example index ${index} does not exist.`);
    this.name = 'InvalidExampleSelectionError';
  }
}

function selectExamples(prompt: LoadedPrompt, indexes: readonly number[] | undefined): PromptExample[] {
  if (indexes === undefined) {
    return prompt.examples;
  }
  return indexes.map((index) => {
    const example = Number.isInteger(index) ? prompt.examples[index] : undefined;
    if (!example) {
      throw new InvalidExampleSelectionError(index, prompt.id, prompt.examples.length);
    }
    return example;
  });
}

function renderConstraints(constraints: string[]): string {
  if (constraints.length === 0) {
    return '';
  }
  const lines = constraints.map((constraint) => `- ${constraint}`).join('\n');
  return `\n\nConstraints:\n${lines}`;
}

/**
 * Trailing block, per the specification's decision: examples are appended
 * after the real request rather than delivered as fake conversation turns,
 * which keeps a retry's "one message to append to" invariant simple.
 * Banned phrases are deliberately never rendered anywhere in this output.
 */
function renderExamples(examples: PromptExample[]): string {
  if (examples.length === 0) {
    return '';
  }
  const blocks = examples
    .map(
      (example, index) =>
        `Example ${index + 1}\nUser: ${example.user}\nOutput: ${JSON.stringify(example.output)}`,
    )
    .join('\n\n');
  return `\n\nExamples:\n\n${blocks}`;
}

/**
 * Renders the template, then the constraints, then the examples. `options`
 * (added by F14) narrows the examples to a selection and appends a trailing
 * block; without it the output is exactly what it always was.
 */
export function renderUserMessage(
  prompt: LoadedPrompt,
  variables: Record<string, string>,
  options: PromptExecutionOptions = {},
): string {
  const examples = selectExamples(prompt, options.exampleIndexes);
  const resolved: Record<string, string> = {};

  for (const variable of prompt.variables) {
    const value = variables[variable.name];
    const isEmpty = value === undefined || value === null || value.trim() === '';

    if (variable.required && isEmpty) {
      throw new MissingRequiredVariableError(variable.name, prompt.id);
    }

    resolved[variable.name] = isEmpty ? '' : value;
  }

  const body = substitute(prompt.userTemplate, resolved);
  const appendix = options.appendix?.trim() ? `\n\n${options.appendix.trim()}` : '';
  return `${body}${renderConstraints(prompt.constraints)}${renderExamples(examples)}${appendix}`;
}

/**
 * The one schema retry reuses the same rendered content — it does not
 * replay the model's invalid response as conversation history, per the
 * specification's decision to read "validation errors appended to the user
 * message" as one message growing, not a new turn.
 */
export function buildRetryMessage(renderedMessage: string, validationErrors: string[]): string {
  const errorLines = validationErrors.map((error) => `- ${error}`).join('\n');
  return (
    `${renderedMessage}\n\n` +
    'Correction needed: your previous response did not satisfy the required JSON schema. ' +
    'Fix the following problems and respond again with the full corrected JSON, nothing else:\n' +
    errorLines
  );
}
