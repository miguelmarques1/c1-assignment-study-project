import { afterEach, describe, expect, it, vi } from 'vitest';

import { AzureSpeechValidator } from '../../src/credentials/validation/azure-speech.validator';

const KEY = 'a-very-real-looking-azure-speech-key-0000';
const REGION = 'brazilsouth';

const validator = new AzureSpeechValidator();

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response> | never) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function response(status: number, body = ''): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

describe('AzureSpeechValidator', () => {
  it('classifies_success_as_valid', async () => {
    stubFetch(async () => response(200, 'a.jwt.token'));

    await expect(validator.validate(KEY, REGION)).resolves.toEqual({
      status: 'valid',
      providerMessage: null,
    });
  });

  it('targets_the_regional_issue_token_endpoint', async () => {
    const fetchMock = vi.fn(async () => response(200));
    vi.stubGlobal('fetch', fetchMock);

    await validator.validate(KEY, REGION);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://${REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe(KEY);
  });

  it('classifies_a_rejection_as_invalid', async () => {
    // The exact envelope Azure returns, captured from a live 401.
    const body = JSON.stringify({
      error: {
        code: '401',
        message:
          'Access denied due to invalid subscription key or wrong API endpoint. Make sure to provide a valid key for an active subscription and use a correct regional API endpoint for your resource.',
      },
    });
    stubFetch(async () => response(401, body));

    const outcome = await validator.validate(KEY, REGION);

    expect(outcome.status).toBe('invalid');
    expect(outcome.providerMessage).toContain('Access denied due to invalid subscription key');
    // The human sentence, not the JSON envelope it arrived in.
    expect(outcome.providerMessage).not.toContain('{');
  });

  it('classifies_a_forbidden_response_as_invalid', async () => {
    stubFetch(async () => response(403, 'Forbidden'));
    await expect(validator.validate(KEY, REGION)).resolves.toMatchObject({ status: 'invalid' });
  });

  it('classifies_a_server_error_as_unverified', async () => {
    // 5xx says nothing about the key, so it must not discard a good one.
    stubFetch(async () => response(503));
    await expect(validator.validate(KEY, REGION)).resolves.toMatchObject({ status: 'unverified' });
  });

  it('classifies_a_network_failure_as_unverified', async () => {
    stubFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND nowhere.api.cognitive.microsoft.com');
    });

    const outcome = await validator.validate(KEY, 'nowhere');

    expect(outcome.status).toBe('unverified');
    expect(outcome.providerMessage).toContain('ENOTFOUND');
  });

  it('classifies_a_timeout_as_unverified', async () => {
    stubFetch(async () => {
      throw new Error('The operation was aborted due to timeout');
    });

    await expect(validator.validate(KEY, REGION)).resolves.toMatchObject({ status: 'unverified' });
  });

  it('never_includes_the_key_in_the_outcome', async () => {
    // A provider that echoes the key back in its error body.
    stubFetch(async () => response(401, `Key ${KEY} was rejected`));

    const outcome = await validator.validate(KEY, REGION);

    expect(JSON.stringify(outcome)).not.toContain(KEY);
    expect(outcome.providerMessage).toContain('***');
  });
});
