import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FastTranscriptionClient } from '../../src/speech/fast-transcription.client';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../../src/speech/speech-errors';

const KEY = 'a-very-real-looking-azure-speech-key-0000';
const REGION = 'eastus2';

const client = new FastTranscriptionClient();
let workDir: string;
let audioPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'fast-transcription-spec-'));
  audioPath = join(workDir, 'audio.ogg');
  await writeFile(audioPath, Buffer.alloc(2048, 1));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function request(locale = 'en-US') {
  return { key: KEY, region: REGION, filePath: audioPath, contentType: 'audio/ogg', locale };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const OK_BODY = {
  durationMilliseconds: 5000,
  phrases: [
    {
      offsetMilliseconds: 720,
      durationMilliseconds: 480,
      text: 'Hello.',
      confidence: 0.91,
      words: [{ text: 'Hello.', offsetMilliseconds: 720, durationMilliseconds: 480 }],
    },
  ],
};

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function definitionOf(init: RequestInit): Promise<Record<string, unknown>> {
  const form = init.body as FormData;
  return JSON.parse(form.get('definition') as string) as Record<string, unknown>;
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

describe('FastTranscriptionClient', () => {
  it('posts_multipart_to_the_regional_endpoint', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, OK_BODY));

    const result = await client.transcribe(request());

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://eastus2.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe(KEY);
    const form = init.body as FormData;
    const audio = form.get('audio') as File;
    expect(audio.size).toBe(2048);
    expect(audio.type).toBe('audio/ogg');
    expect(form.get('definition')).toEqual(expect.any(String));
    expect(result.apiVersion).toBe('2025-10-15');
    expect(result.utterances).toHaveLength(1);
  });

  it('sends_a_verbatim_single_speaker_definition', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, OK_BODY));

    await client.transcribe(request());

    const definition = await definitionOf(fetchMock.mock.calls[0]![1]);
    expect(definition).toEqual({ locales: ['en-US'], profanityFilterMode: 'None' });
    expect(definition).not.toHaveProperty('diarization');
    expect(definition).not.toHaveProperty('channels');
    expect(definition).not.toHaveProperty('phraseList');
  });

  it('uses_the_configured_locale', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, OK_BODY));

    await client.transcribe(request('en-GB'));

    expect((await definitionOf(fetchMock.mock.calls[0]![1])).locales).toEqual(['en-GB']);
  });

  it('maps_401_and_403_to_auth_rejected_with_status', async () => {
    for (const status of [401, 403]) {
      stubFetch(async () =>
        jsonResponse(status, {
          error: { code: String(status), message: 'Access denied due to invalid subscription key.' },
        }),
      );

      const error = await rejection(client.transcribe(request()));
      expect(error).toBeInstanceOf(SpeechAuthRejectedError);
      // The executor reads `status` to mark the stored key invalid.
      expect((error as SpeechAuthRejectedError).status).toBe(status);
      expect((error as SpeechAuthRejectedError).providerMessage).toBe(
        'Access denied due to invalid subscription key.',
      );
    }
  });

  it('maps_429_to_throttled', async () => {
    stubFetch(async () => jsonResponse(429, { error: { message: 'Too many requests.' } }));

    await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechThrottledError);
  });

  it('maps_5xx_network_and_timeout_to_service_error', async () => {
    stubFetch(async () => jsonResponse(503, { error: { message: 'Service unavailable.' } }));
    await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechServiceError);

    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechServiceError);

    stubFetch(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechServiceError);
  });

  it('maps_rejected_audio_statuses', async () => {
    for (const status of [400, 413, 415, 422]) {
      stubFetch(async () => jsonResponse(status, { error: { message: 'Unsupported audio.' } }));
      await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechAudioRejectedError);
    }
  });

  it('maps_404_to_region_unsupported', async () => {
    stubFetch(async () => jsonResponse(404, { error: { message: 'Resource not found.' } }));

    await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechRegionUnsupportedError);
  });

  it('treats_an_unreadable_success_body_as_a_service_error', async () => {
    stubFetch(async () => new Response('not json', { status: 200 }));

    await expect(client.transcribe(request())).rejects.toBeInstanceOf(SpeechServiceError);
  });

  it('never_leaks_the_key_in_an_error', async () => {
    stubFetch(async () => jsonResponse(401, { error: { message: `Key ${KEY} is not valid for this resource.` } }));
    const auth = await rejection(client.transcribe(request()));

    stubFetch(async () => {
      throw new TypeError(`connect ECONNREFUSED while sending ${KEY}`);
    });
    const network = await rejection(client.transcribe(request()));

    for (const error of [auth, network]) {
      expect(error.message).not.toContain(KEY);
      expect((error as SpeechServiceError).providerMessage ?? '').not.toContain(KEY);
    }
  });
});
