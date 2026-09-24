import { Injectable } from '@nestjs/common';
import type { TranscriptWord } from '@english-quest/shared';

import { env } from '../config/env';
import { CredentialExecutorService } from '../credentials/credential-executor.service';
import { FastTranscriptionClient } from './fast-transcription.client';
import type { RecognizedUtterance } from './fast-transcription.response';
import { FAST_TRANSCRIPTION_PROVIDER } from './speech.constants';
import { SpeechRegionUnsupportedError } from './speech-errors';

export interface SpeechTranscription {
  provider: string;
  apiVersion: string;
  locale: string;
  latencyMs: number;
  audioDurationMs: number | null;
  utterances: RecognizedUtterance[];
}

export interface ClipTranscription {
  text: string;
  /** Mean of the phrases' confidence, or null when the provider gave none. */
  confidence: number | null;
  words: TranscriptWord[];
}

/**
 * Speech-to-text on the owner's own Azure key. Both entry points run inside
 * `CredentialExecutorService.withKey`, so every use is audited under the
 * caller's feature label, a refused key is marked invalid, and the decrypted
 * key never outlives the request. Errors surface as they are (`CRED002`,
 * `CRED003`, or a typed `SpeechError`) for each caller to map to its own outcome.
 */
@Injectable()
export class SpeechToTextService {
  constructor(
    private readonly executor: CredentialExecutorService,
    private readonly client: FastTranscriptionClient,
  ) {}

  async transcribeFile(
    userId: string,
    filePath: string,
    feature: string,
    contentType = 'audio/ogg',
  ): Promise<SpeechTranscription> {
    const locale = env().TRANSCRIPTION_LOCALE;

    return this.executor.withKey(userId, 'azure_speech', feature, async ({ key, region }) => {
      if (!region) {
        throw new SpeechRegionUnsupportedError('No Azure Speech region is stored with this key.');
      }
      const result = await this.client.transcribe({ key, region, filePath, contentType, locale });
      return {
        provider: FAST_TRANSCRIPTION_PROVIDER,
        apiVersion: result.apiVersion,
        locale,
        latencyMs: result.latencyMs,
        audioDurationMs: result.audioDurationMs,
        utterances: result.utterances,
      };
    });
  }

  /** A short recording as one piece of text — F18's open response, transcribed before it is assessed. */
  async transcribeClip(
    userId: string,
    filePath: string,
    feature: string,
    contentType = 'audio/wav',
  ): Promise<ClipTranscription> {
    const { utterances } = await this.transcribeFile(userId, filePath, feature, contentType);
    const confidences = utterances
      .map((utterance) => utterance.confidence)
      .filter((value): value is number => value !== null);

    return {
      text: utterances.map((utterance) => utterance.text).join(' '),
      confidence:
        confidences.length === 0 ? null : confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
      words: utterances.flatMap((utterance) => utterance.words),
    };
  }
}
