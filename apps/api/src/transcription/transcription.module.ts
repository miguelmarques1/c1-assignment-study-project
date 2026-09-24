import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { SpeechModule } from '../speech/speech.module';
import { TranscriptWriter } from './transcript-writer.service';
import { TranscriptionStageHandler } from './transcription-stage.handler';

/**
 * The `transcription` stage (F08). Registers its handler with the pipeline
 * runner at module init; the merged transcript read lives here too.
 */
@Module({
  imports: [PipelineModule, SpeechModule],
  providers: [TranscriptWriter, TranscriptionStageHandler],
})
export class TranscriptionModule {}
