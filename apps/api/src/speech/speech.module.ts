import { Module } from '@nestjs/common';

import { FastTranscriptionClient } from './fast-transcription.client';
import { SpeechToTextService } from './speech-to-text.service';

/**
 * Azure Speech, always on the owner's key through the vault's executor.
 * F08 adds transcription; F10 adds pronunciation assessment here; F18
 * imports the module for its speaking activities.
 */
@Module({
  providers: [FastTranscriptionClient, SpeechToTextService],
  exports: [SpeechToTextService],
})
export class SpeechModule {}
