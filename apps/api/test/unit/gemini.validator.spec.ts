import { describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above the imports, so the mock it references has to be
// hoisted with it — otherwise the factory runs before `listMock` exists.
const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { list: listMock };
  },
}));

import { GeminiValidator } from '../../src/credentials/validation/gemini.validator';

const KEY = 'AIzaSyD-a-very-real-looking-gemini-key-f4Qa';
const validator = new GeminiValidator();

describe('GeminiValidator', () => {
  it('classifies_success_as_valid', async () => {
    listMock.mockResolvedValueOnce({ page: [] });

    await expect(validator.validate(KEY)).resolves.toEqual({
      status: 'valid',
      providerMessage: null,
    });
  });

  it('classifies_a_rejection_as_invalid', async () => {
    // The wording Google actually returns for a bad key.
    listMock.mockRejectedValueOnce(
      Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 }),
    );

    const outcome = await validator.validate(KEY);

    expect(outcome.status).toBe('invalid');
    expect(outcome.providerMessage).toBe('API key not valid. Please pass a valid API key.');
  });

  it('classifies_a_permission_error_as_invalid', async () => {
    listMock.mockRejectedValueOnce(new Error('PERMISSION_DENIED: key lacks access'));
    await expect(validator.validate(KEY)).resolves.toMatchObject({ status: 'invalid' });
  });

  it('classifies_a_network_failure_as_unverified', async () => {
    listMock.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

    const outcome = await validator.validate(KEY);

    expect(outcome.status).toBe('unverified');
    expect(outcome.providerMessage).toContain('ECONNREFUSED');
  });

  it('classifies_a_rate_limit_as_unverified', async () => {
    // 429 says the key exists and is being throttled, which is not a bad key.
    listMock.mockRejectedValueOnce(
      Object.assign(new Error('RESOURCE_EXHAUSTED: quota exceeded'), { status: 429 }),
    );

    await expect(validator.validate(KEY)).resolves.toMatchObject({ status: 'unverified' });
  });

  it('classifies_a_timeout_as_unverified', async () => {
    listMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 10_000)),
    );

    const outcome = await validator.validate(KEY);

    expect(outcome.status).toBe('unverified');
    expect(outcome.providerMessage).toContain('timed out');
  }, 15_000);

  it('never_includes_the_key_in_the_outcome', async () => {
    listMock.mockRejectedValueOnce(
      Object.assign(new Error(`Request with key=${KEY} was rejected`), { status: 400 }),
    );

    const outcome = await validator.validate(KEY);

    expect(JSON.stringify(outcome)).not.toContain(KEY);
    expect(outcome.providerMessage).toContain('***');
  });

  it('reports_only_the_first_line_of_a_multiline_error', async () => {
    listMock.mockRejectedValueOnce(
      Object.assign(new Error('API key not valid.\n  at someInternal (file.js:1:1)'), {
        status: 400,
      }),
    );

    const outcome = await validator.validate(KEY);

    expect(outcome.providerMessage).toBe('API key not valid.');
  });
});
