import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import { firstLine, humanMessage, scrubSecret } from '../credentials/validation/validation-outcome';
import { parsePronunciationAssessment, type MappedPronunciationResult } from './pronunciation-assessment.response';
import {
  PRONUNCIATION_ASSESSMENT_TIMEOUT_MS,
  pronunciationAssessmentParams,
  pronunciationAssessmentUrl,
} from './speech.constants';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from './speech-errors';

export interface PronunciationAssessmentRequest {
  key: string;
  region: string;
  locale: string;
  filePath: string;
  contentType: string;
  referenceText: string;
}

export interface PronunciationAssessmentResult extends MappedPronunciationResult {
  latencyMs: number;
}

const AUDIO_REJECTED_STATUSES = new Set([400, 413, 415]);

/**
 * The only place that calls Azure's pronunciation assessment. One request
 * per excerpt: the REST API for short audio, with the phoneme, prosody,
 * miscue and IPA parameters in the base64 `Pronunciation-Assessment` header
 * and the clip's own WAV bytes as the body. No Speech SDK.
 */
@Injectable()
export class PronunciationAssessmentClient {
  async assess(request: PronunciationAssessmentRequest): Promise<PronunciationAssessmentResult> {
    const body = await readFile(request.filePath);
    const params = pronunciationAssessmentParams(request.referenceText);
    const scrub = (message: string) => scrubSecret(firstLine(message), request.key);
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(pronunciationAssessmentUrl(request.region, request.locale), {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': request.key,
          'Content-Type': request.contentType,
          Accept: 'application/json',
          'Pronunciation-Assessment': Buffer.from(JSON.stringify(params)).toString('base64'),
        },
        body,
        signal: AbortSignal.timeout(PRONUNCIATION_ASSESSMENT_TIMEOUT_MS),
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      throw new SpeechServiceError(scrub(`Azure Speech could not be reached: ${raw}`));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const providerMessage = scrub(humanMessage(text)) || `Azure Speech responded with HTTP ${response.status}.`;
      throw this.errorFor(response.status, providerMessage);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new SpeechServiceError('Azure Speech returned a response that could not be read.', response.status);
    }

    return {
      ...parsePronunciationAssessment(json),
      latencyMs: Date.now() - startedAt,
    };
  }

  private errorFor(status: number, providerMessage: string): Error {
    if (status === 401 || status === 403) {
      return new SpeechAuthRejectedError(providerMessage, status);
    }
    if (status === 429) {
      return new SpeechThrottledError(providerMessage, status);
    }
    if (status === 404) {
      return new SpeechRegionUnsupportedError(providerMessage, status);
    }
    if (AUDIO_REJECTED_STATUSES.has(status)) {
      return new SpeechAudioRejectedError(providerMessage, status);
    }
    return new SpeechServiceError(providerMessage, status);
  }
}
