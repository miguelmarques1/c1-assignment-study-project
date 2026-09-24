import { Module } from '@nestjs/common';

import { ExcerptSelectionModule } from '../excerpts/excerpt-selection.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { SpeechModule } from '../speech/speech.module';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';
import { TranscriptWriter } from './transcript-writer.service';
import { TranscriptionStageHandler } from './transcription-stage.handler';

/**
 * The `transcription` stage (F08). Registers its handler with the pipeline
 * runner at module init; the merged transcript read lives here too, and
 * shows the caller's own excerpt selection through F09's reader.
 */
@Module({
  imports: [PipelineModule, SpeechModule, ExcerptSelectionModule],
  controllers: [TranscriptController],
  providers: [TranscriptWriter, TranscriptionStageHandler, TranscriptService],
})
export class TranscriptionModule {}
