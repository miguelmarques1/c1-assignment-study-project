import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { SpeechModule } from '../speech/speech.module';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { TranscriptWriter } from './transcript-writer.service';
import { TranscriptionStageHandler } from './transcription-stage.handler';

/**
 * The `transcription` stage (F08). Registers its handler with the pipeline
 * runner at module init; the merged transcript read lives here too.
 */
@Module({
  imports: [PipelineModule, SpeechModule],
  controllers: [TranscriptController],
  providers: [TranscriptWriter, TranscriptionStageHandler, TranscriptService],
})
export class TranscriptionModule {}
