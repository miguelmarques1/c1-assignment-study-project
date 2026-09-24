import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';

import { Injectable } from '@nestjs/common';

import { firstLine, humanMessage, scrubSecret } from '../credentials/validation/validation-outcome';
import { parseFastTranscription, type RecognizedTranscript } from './fast-transcription.response';
import {
  FAST_TRANSCRIPTION_API_VERSION,
  FAST_TRANSCRIPTION_TIMEOUT_MS,
  fastTranscriptionUrl,
} from './speech.constants';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from './speech-errors';

export interface FastTranscriptionRequest {
  key: string;
  region: string;
  filePath: string;
  contentType: string;
  locale: string;
}

export interface FastTranscriptionResult extends RecognizedTranscript {
  apiVersion: string;
  latencyMs: number;
}

const AUDIO_REJECTED_STATUSES = new Set([400, 413, 415, 422]);

/**
 * The only place that calls Azure's fast transcription. One synchronous
 * multipart request per file; the definition asks for verbatim text
 * (`profanityFilterMode: None` — F11 quotes errors word for word, and the
 * default masking would replace them with asterisks), and deliberately sends
 * no diarization, channels or phrase list: one track is one speaker, and a
 * phrase list of what the learner was meant to say would bias recognition
 * toward exactly the words whose mispronunciation matters.
 */
@Injectable()
export class FastTranscriptionClient {
  async transcribe(request: FastTranscriptionRequest): Promise<FastTranscriptionResult> {
    const form = new FormData();
    form.append('audio', await openAsBlob(request.filePath, { type: request.contentType }), basename(request.filePath));
    form.append('definition', JSON.stringify({ locales: [request.locale], profanityFilterMode: 'None' }));

    const scrub = (message: string) => scrubSecret(firstLine(message), request.key);
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(fastTranscriptionUrl(request.region), {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': request.key },
        body: form,
        signal: AbortSignal.timeout(FAST_TRANSCRIPTION_TIMEOUT_MS),
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      throw new SpeechServiceError(scrub(`Azure Speech could not be reached: ${raw}`));
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const providerMessage =
        scrub(humanMessage(body)) || `Azure Speech responded with HTTP ${response.status}.`;
      throw this.errorFor(response.status, providerMessage);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SpeechServiceError('Azure Speech returned a response that could not be read.', response.status);
    }

    return {
      ...parseFastTranscription(body),
      apiVersion: FAST_TRANSCRIPTION_API_VERSION,
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
