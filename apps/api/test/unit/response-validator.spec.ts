import Ajv from 'ajv';
import { describe, expect, it, vi } from 'vitest';

import { validateResponse } from '../../src/prompts/response-validator';
import type { LoadedPrompt } from '../../src/prompts/prompt-types';

function prompt(id: string, responseSchema: Record<string, unknown>): LoadedPrompt {
  return {
    id,
    version: '1',
    model: 'gemini-3.6-flash',
    temperature: 0.5,
    maxOutputTokens: 500,
    responseSchema,
    system: 'system',
    userTemplate: 'template',
    variables: [],
    examples: [],
    bannedPhrases: [],
    constraints: [],
    filePath: `/fake/${id}.yaml`,
  };
}

describe('validateResponse', () => {
  it('valid_response_passes', () => {
    const p = prompt('valid-case', {
      type: 'object',
      properties: { greeting: { type: 'string' } },
      required: ['greeting'],
    });

    const result = validateResponse(p, { greeting: 'hi' });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('invalid_response_reports_every_violated_field', () => {
    const p = prompt('invalid-case', {
      type: 'object',
      properties: {
        greeting: { type: 'string' },
        count: { type: 'integer' },
      },
      required: ['greeting', 'count'],
    });

    const result = validateResponse(p, { greeting: 42 });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.includes('greeting'))).toBe(true);
    expect(result.errors.some((e) => e.includes('count'))).toBe(true);
  });

  it('an_enum_violation_is_reported_as_a_schema_failure', () => {
    const p = prompt('enum-case', {
      type: 'object',
      properties: {
        tag: { type: 'string', enum: ['grammar', 'vocabulary'] },
      },
      required: ['tag'],
    });

    const result = validateResponse(p, { tag: 'not-a-real-tag' });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('tag'))).toBe(true);
  });

  it('caches_the_compiled_validator_per_prompt', () => {
    const compileSpy = vi.spyOn(Ajv.prototype, 'compile');
    const p = prompt('cache-case-unique', {
      type: 'object',
      properties: { greeting: { type: 'string' } },
      required: ['greeting'],
    });
    const callsBefore = compileSpy.mock.calls.length;

    validateResponse(p, { greeting: 'a' });
    validateResponse(p, { greeting: 'b' });
    validateResponse(p, { greeting: 'c' });

    expect(compileSpy.mock.calls.length - callsBefore).toBe(1);
    compileSpy.mockRestore();
  });
});
