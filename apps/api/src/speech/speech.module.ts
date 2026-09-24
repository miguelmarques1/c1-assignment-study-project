import { Module } from '@nestjs/common';

import { FastTranscriptionClient } from './fast-transcription.client';
import { PronunciationAssessmentClient } from './pronunciation-assessment.client';
import { PronunciationAssessmentService } from './pronunciation-assessment.service';
import { SpeechToTextService } from './speech-to-text.service';

/**
 * Azure Speech, always on the owner's key through the vault's executor.
 * F08 adds transcription; F10 adds pronunciation assessment here; F18
 * imports the module for its speaking activities.
 */
@Module({
  providers: [FastTranscriptionClient, SpeechToTextService, PronunciationAssessmentClient, PronunciationAssessmentService],
  exports: [SpeechToTextService, PronunciationAssessmentService],
})
export class SpeechModule {}
