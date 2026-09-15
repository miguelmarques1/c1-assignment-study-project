import Ajv, { type ValidateFunction } from 'ajv';

/**
 * Describes the YAML envelope itself — the fields every prompt file must
 * carry, not the `response_schema` field's own content (that is compiled
 * and checked separately in prompt-file-loader.ts, since it is itself a
 * JSON Schema and not a fixed shape).
 *
 * `additionalProperties: false` at the top level is what turns a typo'd
 * field name into a named boot failure instead of a silently ignored key.
 */
export const promptEnvelopeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    version: { type: 'string', minLength: 1 },
    model: { type: 'string', minLength: 1 },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    max_output_tokens: { type: 'integer', minimum: 1 },
    response_schema: { type: 'object' },
    system: { type: 'string', minLength: 1 },
    user_template: { type: 'string', minLength: 1 },
    variables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          required: { type: 'boolean' },
        },
        required: ['name', 'required'],
        additionalProperties: false,
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user: { type: 'string', minLength: 1 },
          output: {},
        },
        required: ['user', 'output'],
        additionalProperties: false,
      },
    },
    banned_phrases: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    constraints: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
  required: [
    'id',
    'version',
    'model',
    'temperature',
    'max_output_tokens',
    'response_schema',
    'system',
    'user_template',
    'variables',
  ],
  additionalProperties: false,
} as const;

const ajv = new Ajv({ allErrors: true });

let compiled: ValidateFunction | undefined;

/** Memoized — the envelope schema is fixed, so it only needs compiling once. */
export function validatePromptEnvelope(): ValidateFunction {
  compiled ??= ajv.compile(promptEnvelopeSchema);
  return compiled;
}
