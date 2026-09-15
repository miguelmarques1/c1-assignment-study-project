import { describe, expect, it } from 'vitest';

import {
  MissingRequiredVariableError,
  buildRetryMessage,
  renderUserMessage,
} from '../../src/prompts/template-renderer';
import type { LoadedPrompt } from '../../src/prompts/prompt-types';

function prompt(overrides: Partial<LoadedPrompt> = {}): LoadedPrompt {
  return {
    id: 'test-prompt',
    version: '1',
    model: 'gemini-3.6-flash',
    temperature: 0.5,
    maxOutputTokens: 500,
    responseSchema: { type: 'object' },
    system: 'You are a test assistant.',
    userTemplate: 'Hello {{name}}, region {{region}}.',
    variables: [
      { name: 'name', required: true },
      { name: 'region', required: false },
    ],
    examples: [],
    bannedPhrases: [],
    constraints: [],
    filePath: '/fake/test-prompt.yaml',
    ...overrides,
  };
}

describe('renderUserMessage', () => {
  it('substitutes_every_declared_variable', () => {
    const message = renderUserMessage(prompt(), { name: 'Ana', region: 'south' });

    expect(message).toContain('Hello Ana, region south.');
  });

  it('throws_when_a_required_variable_is_absent_or_empty', () => {
    expect(() => renderUserMessage(prompt(), { region: 'south' })).toThrow(
      MissingRequiredVariableError,
    );
    expect(() => renderUserMessage(prompt(), { name: '   ', region: 'south' })).toThrow(
      MissingRequiredVariableError,
    );
  });

  it('optional_variables_default_to_an_empty_substitution', () => {
    const message = renderUserMessage(prompt(), { name: 'Ana' });

    expect(message).toContain('Hello Ana, region .');
  });

  it('renders_constraints_into_the_instruction_text', () => {
    const message = renderUserMessage(
      prompt({ constraints: ['Never invent a name.', 'Keep it short.'] }),
      { name: 'Ana', region: 'south' },
    );

    expect(message).toContain('Never invent a name.');
    expect(message).toContain('Keep it short.');
  });

  it('never_sends_banned_phrases_to_the_model', () => {
    const message = renderUserMessage(prompt({ bannedPhrases: ['forbidden-term'] }), {
      name: 'Ana',
      region: 'south',
    });

    expect(message).not.toContain('forbidden-term');
  });

  it('appends_examples_as_a_trailing_text_block', () => {
    const message = renderUserMessage(
      prompt({
        examples: [
          { user: 'Hello Bob, region north.', output: { greeting: 'Hi Bob!' } },
          { user: 'Hello Cara, region west.', output: { greeting: 'Hi Cara!' } },
        ],
      }),
      { name: 'Ana', region: 'south' },
    );

    const mainIndex = message.indexOf('Hello Ana, region south.');
    const examplesIndex = message.indexOf('Examples:');
    const example1Index = message.indexOf('Hello Bob, region north.');
    const example2Index = message.indexOf('Hello Cara, region west.');

    expect(mainIndex).toBeGreaterThanOrEqual(0);
    expect(examplesIndex).toBeGreaterThan(mainIndex);
    expect(example1Index).toBeGreaterThan(examplesIndex);
    expect(example2Index).toBeGreaterThan(example1Index);
  });
});

describe('buildRetryMessage', () => {
  it('builds_the_retry_message_by_appending_validation_errors_to_the_same_content', () => {
    const original = renderUserMessage(prompt(), { name: 'Ana', region: 'south' });
    const retry = buildRetryMessage(original, ['/greeting must be string', '/errors is required']);

    expect(retry.startsWith(original)).toBe(true);
    expect(retry).toContain('/greeting must be string');
    expect(retry).toContain('/errors is required');
    expect(retry).toContain('Correction needed');
  });
});
