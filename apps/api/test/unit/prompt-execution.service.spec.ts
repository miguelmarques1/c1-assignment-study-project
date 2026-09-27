import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  ThinkingLevel: { LOW: 'LOW' },
}));

import { AppError } from '../../src/common/app-error';
import { PromptExecutionService } from '../../src/prompts/prompt-execution.service';
import type { LoadedPrompt } from '../../src/prompts/prompt-types';

function makePrompt(overrides: Partial<LoadedPrompt> = {}): LoadedPrompt {
  return {
    id: 'demo-prompt',
    version: '2',
    model: 'gemini-3.6-flash',
    temperature: 0.5,
    maxOutputTokens: 500,
    responseSchema: {
      type: 'object',
      properties: { greeting: { type: 'string' } },
      required: ['greeting'],
    },
    system: 'system text',
    userTemplate: 'Hello {{name}}.',
    variables: [{ name: 'name', required: true }],
    examples: [],
    bannedPhrases: [],
    constraints: [],
    filePath: '/fake/demo-prompt.yaml',
    ...overrides,
  };
}

function fakeResponse(
  json: unknown,
  usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } = {
    promptTokenCount: 10,
    candidatesTokenCount: 20,
    thoughtsTokenCount: 5,
  },
) {
  return { text: JSON.stringify(json), usageMetadata: usage };
}

describe('PromptExecutionService', () => {
  let registry: { get: ReturnType<typeof vi.fn> };
  let credentials: { withKey: ReturnType<typeof vi.fn> };
  let telemetry: { record: ReturnType<typeof vi.fn> };
  let service: PromptExecutionService;

  beforeEach(() => {
    generateContentMock.mockReset();
    registry = { get: vi.fn().mockReturnValue(makePrompt()) };
    credentials = {
      withKey: vi.fn(
        async (_userId: string, _provider: string, _feature: string, work: (ctx: unknown) => unknown) =>
          work({ key: 'fake-key', region: null }),
      ),
    };
    telemetry = { record: vi.fn().mockResolvedValue(undefined) };
     
    service = new PromptExecutionService(registry as any, credentials as any, telemetry as any);
  });

  it('succeeds_on_the_first_attempt', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    const result = await service.execute('user-1', 'demo-prompt', { name: 'Ana' });

    expect(result.data).toEqual({ greeting: 'hi' });
    expect(result.retried).toBe(false);
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(telemetry.record).toHaveBeenCalledTimes(1);
    expect(telemetry.record.mock.calls[0]?.[0].outcome).toBe('ok');
  });

  it('retries_once_and_recovers', async () => {
    generateContentMock
      .mockResolvedValueOnce(fakeResponse({ wrong: 'shape' }))
      .mockResolvedValueOnce(fakeResponse({ greeting: 'fixed' }));

    const result = await service.execute('user-1', 'demo-prompt', { name: 'Ana' });

    expect(result.data).toEqual({ greeting: 'fixed' });
    expect(result.retried).toBe(true);
    expect(generateContentMock).toHaveBeenCalledTimes(2);

    const secondCallArgs = generateContentMock.mock.calls[1]?.[0];
    expect(secondCallArgs.contents).toContain('Correction needed');
    expect(telemetry.record.mock.calls[0]?.[0].outcome).toBe('validation_failed_retried_ok');
  });

  it('passes_the_appendix_and_example_selection_to_rendering', async () => {
    registry.get.mockReturnValue(
      makePrompt({
        examples: [
          { user: 'Example one.', output: { greeting: 'one' } },
          { user: 'Example two.', output: { greeting: 'two' } },
        ],
      }),
    );
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    await service.execute('user-1', 'demo-prompt', { name: 'Ana' }, { appendix: 'Fix the word count.', exampleIndexes: [1] });

    const contents = generateContentMock.mock.calls[0]?.[0].contents as string;
    expect(contents).toContain('Example two.');
    expect(contents).not.toContain('Example one.');
    expect(contents.endsWith('Fix the word count.')).toBe(true);
  });

  it('schema_retry_keeps_the_appendix', async () => {
    generateContentMock
      .mockResolvedValueOnce(fakeResponse({ wrong: 'shape' }))
      .mockResolvedValueOnce(fakeResponse({ greeting: 'fixed' }));

    await service.execute('user-1', 'demo-prompt', { name: 'Ana' }, { appendix: 'Fix the word count.' });

    const retry = generateContentMock.mock.calls[1]?.[0].contents as string;
    expect(retry.indexOf('Fix the word count.')).toBeGreaterThan(0);
    expect(retry.indexOf('Correction needed')).toBeGreaterThan(retry.indexOf('Fix the word count.'));
  });

  it('hard_fails_after_a_second_invalid_response', async () => {
    generateContentMock
      .mockResolvedValueOnce(fakeResponse({ wrong: 'shape' }))
      .mockResolvedValueOnce(fakeResponse({ still: 'wrong' }));

    await expect(service.execute('user-1', 'demo-prompt', { name: 'Ana' })).rejects.toMatchObject({
      code: 'PROMPT001',
    });

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    const recorded = telemetry.record.mock.calls[0]?.[0];
    expect(recorded.outcome).toBe('validation_failed_hard_error');
    expect(recorded.rawResponse).toContain('still');
  });

  it('sums_token_counts_across_both_attempts', async () => {
    generateContentMock
      .mockResolvedValueOnce(
        fakeResponse(
          { wrong: 'shape' },
          { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
        ),
      )
      .mockResolvedValueOnce(
        fakeResponse(
          { greeting: 'fixed' },
          { promptTokenCount: 15, candidatesTokenCount: 8, thoughtsTokenCount: 3 },
        ),
      );

    await service.execute('user-1', 'demo-prompt', { name: 'Ana' });

    const recorded = telemetry.record.mock.calls[0]?.[0];
    expect(recorded.inputTokens).toBe(25);
    expect(recorded.outputTokens).toBe(5 + 2 + 8 + 3);
  });

  it('never_retries_on_timeout', async () => {
    vi.useFakeTimers();
    try {
      generateContentMock.mockImplementation(() => new Promise(() => undefined));

      const promise = service.execute('user-1', 'demo-prompt', { name: 'Ana' });
      const assertion = expect(promise).rejects.toMatchObject({ code: 'PROMPT003' });

      await vi.advanceTimersByTimeAsync(90_000);
      await assertion;

      expect(generateContentMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never_retries_on_an_empty_or_blocked_response', async () => {
    generateContentMock.mockResolvedValueOnce({ text: '', usageMetadata: {} });

    await expect(service.execute('user-1', 'demo-prompt', { name: 'Ana' })).rejects.toMatchObject({
      code: 'PROMPT004',
    });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it('calls_gemini_inside_withkey_with_the_f04_feature_label', async () => {
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    await service.execute('user-42', 'demo-prompt', { name: 'Ana' });

    expect(credentials.withKey).toHaveBeenCalledWith(
      'user-42',
      'gemini',
      'F04_demo-prompt',
      expect.any(Function),
    );
  });

  it('raises_prompt002_for_an_unknown_prompt_id', async () => {
    registry.get.mockImplementation(() => {
      throw AppError.promptNotFound('missing-id');
    });

    await expect(service.execute('user-1', 'missing-id', {})).rejects.toMatchObject({
      code: 'PROMPT002',
    });
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('stamps_the_returned_prompt_version_from_the_registry_at_call_time', async () => {
    registry.get.mockReturnValue(makePrompt({ version: '7' }));
    generateContentMock.mockResolvedValueOnce(fakeResponse({ greeting: 'hi' }));

    const result = await service.execute('user-1', 'demo-prompt', { name: 'Ana' });

    expect(result.promptVersion).toBe('7');
  });

  it('propagates_credential_errors_without_recording_telemetry', async () => {
    const credentialError = AppError.sessionInvalid();
    credentials.withKey.mockRejectedValueOnce(credentialError);

    await expect(service.execute('user-1', 'demo-prompt', { name: 'Ana' })).rejects.toBe(
      credentialError,
    );
    expect(telemetry.record).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
