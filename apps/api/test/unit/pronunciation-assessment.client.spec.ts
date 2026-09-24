import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PronunciationAssessmentClient } from '../../src/speech/pronunciation-assessment.client';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechNoRecognitionError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../../src/speech/speech-errors';

const KEY = 'a-very-real-looking-azure-speech-key-0000';
const REGION = 'eastus2';
const REFERENCE_TEXT = "I'd rather we postponed the whole thing.";

const client = new PronunciationAssessmentClient();
let workDir: string;
let clipPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'pronunciation-assessment-spec-'));
  clipPath = join(workDir, 'clip.wav');
  await writeFile(clipPath, Buffer.alloc(4096, 1));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function request(referenceText = REFERENCE_TEXT) {
  return {
    key: KEY,
    region: REGION,
    locale: 'en-US',
    filePath: clipPath,
    contentType: 'audio/wav; codecs=audio/pcm; samplerate=16000',
    referenceText,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const OK_BODY = {
  RecognitionStatus: 'Success',
  DisplayText: 'Hello there.',
  NBest: [
    {
      Display: 'Hello there.',
      AccuracyScore: 95,
      FluencyScore: 90,
      ProsodyScore: 88,
      CompletenessScore: 100,
      PronScore: 92,
      Words: [
        {
          Word: 'Hello',
          Offset: 900_000,
          Duration: 2_100_000,
          AccuracyScore: 95,
          ErrorType: 'None',
          Phonemes: [{ Phoneme: 'h', Offset: 900_000, Duration: 500_000, AccuracyScore: 95 }],
        },
      ],
    },
  ],
};

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function paramsOf(init: RequestInit): Record<string, unknown> {
  const header = (init.headers as Record<string, string>)['Pronunciation-Assessment']!;
  return JSON.parse(Buffer.from(header, 'base64').toString('utf-8')) as Record<string, unknown>;
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

describe('PronunciationAssessmentClient', () => {
  it('posts_the_clip_to_the_regional_short_audio_endpoint', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, OK_BODY));

    const result = await client.assess(request());

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://eastus2.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed',
    );
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Key']).toBe(KEY);
    expect(headers['Content-Type']).toBe('audio/wav; codecs=audio/pcm; samplerate=16000');
    expect(Buffer.isBuffer(init.body)).toBe(true);
    expect((init.body as Buffer).length).toBe(4096);
    expect(result.scores.pronunciation).toBe(92);
  });

  it('sends_phoneme_prosody_miscue_and_ipa_parameters', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, OK_BODY));

    await client.assess(request());

    const params = paramsOf(fetchMock.mock.calls[0]![1]);
    expect(params).toMatchObject({
      ReferenceText: REFERENCE_TEXT,
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
      EnableProsodyAssessment: true,
      PhonemeAlphabet: 'IPA',
    });
  });

  it('maps_401_and_403_to_auth_rejected_with_status', async () => {
    for (const status of [401, 403]) {
      stubFetch(async () =>
        jsonResponse(status, { error: { message: 'Access denied due to invalid subscription key.' } }),
      );

      const error = await rejection(client.assess(request()));
      expect(error).toBeInstanceOf(SpeechAuthRejectedError);
      expect((error as SpeechAuthRejectedError).status).toBe(status);
    }
  });

  it('maps_429_to_throttled', async () => {
    stubFetch(async () => jsonResponse(429, { error: { message: 'Too many requests.' } }));

    await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechThrottledError);
  });

  it('maps_5xx_network_and_timeout_to_service_error', async () => {
    stubFetch(async () => jsonResponse(503, { error: { message: 'Service unavailable.' } }));
    await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechServiceError);

    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechServiceError);

    stubFetch(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechServiceError);
  });

  it('maps_rejected_audio_statuses', async () => {
    for (const status of [400, 413, 415]) {
      stubFetch(async () => jsonResponse(status, { error: { message: 'Unsupported audio.' } }));
      await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechAudioRejectedError);
    }
  });

  it('maps_404_to_region_unsupported', async () => {
    stubFetch(async () => jsonResponse(404, { error: { message: 'Resource not found.' } }));

    await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechRegionUnsupportedError);
  });

  it('a_status_other_than_success_is_no_recognition', async () => {
    stubFetch(async () => jsonResponse(200, { RecognitionStatus: 'NoMatch' }));

    await expect(client.assess(request())).rejects.toBeInstanceOf(SpeechNoRecognitionError);
  });

  it('never_leaks_the_key_in_an_error', async () => {
    stubFetch(async () => jsonResponse(401, { error: { message: `Key ${KEY} is not valid for this resource.` } }));
    const auth = await rejection(client.assess(request()));

    stubFetch(async () => {
      throw new TypeError(`connect ECONNREFUSED while sending ${KEY}`);
    });
    const network = await rejection(client.assess(request()));

    for (const error of [auth, network]) {
      expect(error.message).not.toContain(KEY);
      expect((error as SpeechServiceError).providerMessage ?? '').not.toContain(KEY);
    }
  });
});
