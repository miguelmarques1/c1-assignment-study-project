import { stat } from 'node:fs/promises';

import type { FastTranscriptionRequest, FastTranscriptionResult } from '../../../src/speech/fast-transcription.client';
import { parseFastTranscription } from '../../../src/speech/fast-transcription.response';
import { FAST_TRANSCRIPTION_API_VERSION } from '../../../src/speech/speech.constants';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../../../src/speech/speech-errors';

export interface FakePhrase {
  offsetMs: number;
  durationMs: number;
  text: string;
  confidence?: number;
  words?: Array<{ text: string; offsetMs: number; durationMs: number }>;
}

export type FakeSpeechStep =
  | { kind: 'ok'; phrases: FakePhrase[]; durationMs?: number }
  | { kind: 'status'; status: number; message?: string }
  | { kind: 'network' }
  | { kind: 'wait'; ms: number; then: FakeSpeechStep };

export interface FakeSpeechCall {
  key: string;
  region: string;
  locale: string;
  contentType: string;
  /** Bytes of the file that would have been uploaded — proves which audio went out. */
  bytes: number;
}

/** Two short phrases, words included — what an ordinary track "sounds like" to the fake. */
export function defaultPhrases(): FakePhrase[] {
  return [
    {
      offsetMs: 1_200,
      durationMs: 3_400,
      text: "I'd like to change my flight.",
      confidence: 0.91,
      words: [
        { text: "I'd", offsetMs: 1_200, durationMs: 240 },
        { text: 'like', offsetMs: 1_440, durationMs: 200 },
        { text: 'to', offsetMs: 1_640, durationMs: 120 },
        { text: 'change', offsetMs: 1_760, durationMs: 480 },
        { text: 'my', offsetMs: 2_240, durationMs: 160 },
        { text: 'flight.', offsetMs: 2_400, durationMs: 600 },
      ],
    },
    {
      offsetMs: 9_000,
      durationMs: 2_000,
      text: 'Is Thursday possible?',
      confidence: 0.74,
      words: [
        { text: 'Is', offsetMs: 9_000, durationMs: 200 },
        { text: 'Thursday', offsetMs: 9_200, durationMs: 900 },
        { text: 'possible?', offsetMs: 10_100, durationMs: 900 },
      ],
    },
  ];
}

function toProviderBody(step: { phrases: FakePhrase[]; durationMs?: number }): unknown {
  return {
    durationMilliseconds: step.durationMs ?? 12_000,
    combinedPhrases: [{ text: step.phrases.map((phrase) => phrase.text).join(' ') }],
    phrases: step.phrases.map((phrase) => ({
      offsetMilliseconds: phrase.offsetMs,
      durationMilliseconds: phrase.durationMs,
      text: phrase.text,
      locale: 'en-US',
      ...(phrase.confidence === undefined ? {} : { confidence: phrase.confidence }),
      words: (phrase.words ?? []).map((word) => ({
        text: word.text,
        offsetMilliseconds: word.offsetMs,
        durationMilliseconds: word.durationMs,
      })),
    })),
  };
}

/**
 * Stands in for `FastTranscriptionClient`, the one class that talks to
 * Azure, so the vault, the executor's invalid-key marking and the
 * credential-usage audit all run for real around it — the same boundary
 * F04's fake Gemini sits at. Every call records the key and region it was
 * handed, which is how the BYOK tests prove routing. Steps are scripted per
 * key; an unscripted key gets `defaultStep`.
 */
export class FakeFastTranscriptionClient {
  readonly calls: FakeSpeechCall[] = [];
  defaultStep: FakeSpeechStep = { kind: 'ok', phrases: defaultPhrases() };
  private readonly scripts = new Map<string, FakeSpeechStep[]>();

  script(key: string, ...steps: FakeSpeechStep[]): void {
    this.scripts.set(key, [...(this.scripts.get(key) ?? []), ...steps]);
  }

  reset(): void {
    this.calls.length = 0;
    this.scripts.clear();
    this.defaultStep = { kind: 'ok', phrases: defaultPhrases() };
  }

  callsFor(key: string): FakeSpeechCall[] {
    return this.calls.filter((call) => call.key === key);
  }

  async transcribe(request: FastTranscriptionRequest): Promise<FastTranscriptionResult> {
    this.calls.push({
      key: request.key,
      region: request.region,
      locale: request.locale,
      contentType: request.contentType,
      bytes: (await stat(request.filePath)).size,
    });
    const step = this.scripts.get(request.key)?.shift() ?? this.defaultStep;
    return this.play(step);
  }

  private async play(step: FakeSpeechStep): Promise<FastTranscriptionResult> {
    switch (step.kind) {
      case 'wait':
        await new Promise((resolve) => setTimeout(resolve, step.ms));
        return this.play(step.then);
      case 'network':
        throw new SpeechServiceError('Azure Speech could not be reached: fetch failed');
      case 'status':
        throw FakeFastTranscriptionClient.errorFor(step.status, step.message ?? `HTTP ${step.status}`);
      case 'ok':
        return { ...parseFastTranscription(toProviderBody(step)), apiVersion: FAST_TRANSCRIPTION_API_VERSION, latencyMs: 42 };
    }
  }

  /** The same status mapping the real client applies (its own unit test pins that one). */
  static errorFor(status: number, message: string): Error {
    if (status === 401 || status === 403) return new SpeechAuthRejectedError(message, status);
    if (status === 429) return new SpeechThrottledError(message, status);
    if (status === 404) return new SpeechRegionUnsupportedError(message, status);
    if ([400, 413, 415, 422].includes(status)) return new SpeechAudioRejectedError(message, status);
    return new SpeechServiceError(message, status);
  }
}
