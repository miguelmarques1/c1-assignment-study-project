import { Injectable } from '@nestjs/common';

import { env } from '../config/env';
import { CredentialExecutorService } from '../credentials/credential-executor.service';
import { PronunciationAssessmentClient } from './pronunciation-assessment.client';
import type { MappedPronunciationResult } from './pronunciation-assessment.response';
import { SpeechRegionUnsupportedError } from './speech-errors';

export interface ClipAssessment extends MappedPronunciationResult {
  latencyMs: number;
  locale: string;
  /** Fixed today; a SAPI fallback would report its own value once the live check requires one. */
  phonemeAlphabet: 'IPA';
}

/**
 * Pronunciation assessment for one audio clip against a reference text, on
 * the owner's own Azure key. F10 calls this once per excerpt; F18 calls it
 * with its own feature label for a speaking activity's recording. Both get
 * the same score set and word- and phoneme-level detail.
 */
@Injectable()
export class PronunciationAssessmentService {
  constructor(
    private readonly executor: CredentialExecutorService,
    private readonly client: PronunciationAssessmentClient,
  ) {}

  async assessClip(
    userId: string,
    filePath: string,
    referenceText: string,
    feature: string,
    contentType = 'audio/wav',
  ): Promise<ClipAssessment> {
    const locale = env().TRANSCRIPTION_LOCALE;

    return this.executor.withKey(userId, 'azure_speech', feature, async ({ key, region }) => {
      if (!region) {
        throw new SpeechRegionUnsupportedError('No Azure Speech region is stored with this key.');
      }
      const result = await this.client.assess({ key, region, locale, filePath, contentType, referenceText });
      return { ...result, locale, phonemeAlphabet: 'IPA' };
    });
  }
}
