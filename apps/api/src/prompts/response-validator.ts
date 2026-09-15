import Ajv, { type ValidateFunction } from 'ajv';

import type { LoadedPrompt } from './prompt-types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// allErrors: without it, Ajv stops at the first violation — the PRD's
// retry-with-validation-errors flow works far better naming every problem
// in one correction pass than making the model guess-and-check.
const ajv = new Ajv({ allErrors: true });

/**
 * One compiled validator per prompt id, cached for the process lifetime.
 * Prompts are loaded once at boot and never hot-reloaded, so a prompt's
 * response_schema cannot change out from under this cache.
 */
const compiledByPromptId = new Map<string, ValidateFunction>();

function compiledFor(prompt: LoadedPrompt): ValidateFunction {
  let validate = compiledByPromptId.get(prompt.id);
  if (!validate) {
    validate = ajv.compile(prompt.responseSchema);
    compiledByPromptId.set(prompt.id, validate);
  }
  return validate;
}

export function validateResponse(prompt: LoadedPrompt, data: unknown): ValidationResult {
  const validate = compiledFor(prompt);
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map(
    (error) => `${error.instancePath || '(root)'} ${error.message ?? 'is invalid'}`,
  );
  return { valid: false, errors };
}
