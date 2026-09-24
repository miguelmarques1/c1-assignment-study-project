import { readFile } from 'node:fs/promises';

import type {
  PronunciationAssessmentRequest,
  PronunciationAssessmentResult,
} from '../../../src/speech/pronunciation-assessment.client';
import { parsePronunciationAssessment } from '../../../src/speech/pronunciation-assessment.response';
import { pronunciationAssessmentParams } from '../../../src/speech/speech.constants';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechNoRecognitionError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../../../src/speech/speech-errors';

export interface FakePronunciationScores {
  pronunciation?: number;
  accuracy?: number;
  fluency?: number;
  prosody?: number | null;
  completeness?: number;
}

export interface FakePronunciationWord {
  word: string;
  accuracy: number;
  errorTypes?: string[];
  phonemes?: Array<{ phoneme: string; accuracy: number }>;
}

export type FakePronunciationStep =
  | { kind: 'ok'; scores?: FakePronunciationScores; words?: FakePronunciationWord[]; recognizedText?: string }
  | { kind: 'status'; status: number; message?: string }
  | { kind: 'network' }
  | { kind: 'no_recognition' }
  | { kind: 'wait'; ms: number; then: FakePronunciationStep };

export interface FakePronunciationCall {
  key: string;
  region: string;
  locale: string;
  referenceText: string;
  contentType: string;
  /** The `Pronunciation-Assessment` header the real client would have sent — a pure function of `referenceText`. */
  params: Record<string, unknown>;
  /** The clip's own duration, read from its WAV header — proves the slice's exact range. */
  clipDurationMs: number;
}

const DEFAULT_SCORES: Required<FakePronunciationScores> = {
  pronunciation: 85,
  accuracy: 88,
  fluency: 82,
  prosody: 80,
  completeness: 100,
};

function scriptKey(key: string, referenceText: string): string {
  return `${key}::${referenceText}`;
}

/** Minimal RIFF/WAVE PCM reader: enough to time our own ffmpeg-produced clips. */
function readWavDurationMs(buffer: Buffer): number {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return 0;
  }
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      byteRate = buffer.readUInt32LE(body + 8);
    } else if (id === 'data') {
      dataSize = size;
    }
    offset = body + size + (size % 2);
  }
  return byteRate === 0 ? 0 : Math.round((dataSize / byteRate) * 1000);
}

function toProviderBody(step: { scores?: FakePronunciationScores; words?: FakePronunciationWord[]; recognizedText?: string }): unknown {
  const scores = { ...DEFAULT_SCORES, ...step.scores };
  return {
    RecognitionStatus: 'Success',
    DisplayText: step.recognizedText ?? '',
    NBest: [
      {
        Display: step.recognizedText ?? '',
        AccuracyScore: scores.accuracy,
        FluencyScore: scores.fluency,
        ...(scores.prosody === null ? {} : { ProsodyScore: scores.prosody }),
        CompletenessScore: scores.completeness,
        PronScore: scores.pronunciation,
        Words: (step.words ?? []).map((word) => ({
          Word: word.word,
          Offset: 0,
          Duration: 100_000,
          AccuracyScore: word.accuracy,
          ErrorType: word.errorTypes?.[0] ?? 'None',
          Phonemes: (word.phonemes ?? []).map((phoneme) => ({
            Phoneme: phoneme.phoneme,
            Offset: 0,
            Duration: 50_000,
            AccuracyScore: phoneme.accuracy,
          })),
        })),
      },
    ],
  };
}

/**
 * Stands in for `PronunciationAssessmentClient`, the one class that calls
 * Azure, so the vault, the executor's invalid-key marking and the
 * credential-usage audit all run for real around it — the same boundary
 * `FakeFastTranscriptionClient` sits at. Scripted per key and per reference
 * text (F10's excerpts each carry their own), with an unscripted pair
 * getting `defaultStep`.
 */
export class FakePronunciationAssessmentClient {
  readonly calls: FakePronunciationCall[] = [];
  defaultStep: FakePronunciationStep = { kind: 'ok' };
  private readonly scripts = new Map<string, FakePronunciationStep[]>();

  script(key: string, referenceText: string, ...steps: FakePronunciationStep[]): void {
    const k = scriptKey(key, referenceText);
    this.scripts.set(k, [...(this.scripts.get(k) ?? []), ...steps]);
  }

  reset(): void {
    this.calls.length = 0;
    this.scripts.clear();
    this.defaultStep = { kind: 'ok' };
  }

  callsFor(key: string): FakePronunciationCall[] {
    return this.calls.filter((call) => call.key === key);
  }

  async assess(request: PronunciationAssessmentRequest): Promise<PronunciationAssessmentResult> {
    const buffer = await readFile(request.filePath);
    this.calls.push({
      key: request.key,
      region: request.region,
      locale: request.locale,
      referenceText: request.referenceText,
      contentType: request.contentType,
      params: pronunciationAssessmentParams(request.referenceText),
      clipDurationMs: readWavDurationMs(buffer),
    });
    const step = this.scripts.get(scriptKey(request.key, request.referenceText))?.shift() ?? this.defaultStep;
    return this.play(step);
  }

  private async play(step: FakePronunciationStep): Promise<PronunciationAssessmentResult> {
    switch (step.kind) {
      case 'wait':
        await new Promise((resolve) => setTimeout(resolve, step.ms));
        return this.play(step.then);
      case 'network':
        throw new SpeechServiceError('Azure Speech could not be reached: fetch failed');
      case 'status':
        throw FakePronunciationAssessmentClient.errorFor(step.status, step.message ?? `HTTP ${step.status}`);
      case 'no_recognition':
        throw new SpeechNoRecognitionError('Azure Speech reported NoMatch.');
      case 'ok':
        return { ...parsePronunciationAssessment(toProviderBody(step)), latencyMs: 5 };
    }
  }

  /** The same status mapping the real client applies (its own unit test pins that one). */
  static errorFor(status: number, message: string): Error {
    if (status === 401 || status === 403) return new SpeechAuthRejectedError(message, status);
    if (status === 429) return new SpeechThrottledError(message, status);
    if (status === 404) return new SpeechRegionUnsupportedError(message, status);
    if ([400, 413, 415].includes(status)) return new SpeechAudioRejectedError(message, status);
    return new SpeechServiceError(message, status);
  }
}
