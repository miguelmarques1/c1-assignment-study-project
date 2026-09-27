import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { ProfileModule } from '../profile/profile.module';
import { ExcerptRulesService } from './excerpt-rules.service';
import { ExcerptSelectionStageHandler } from './excerpt-selection-stage.handler';
import { ExcerptSelectionReader } from './excerpt-selection.reader';
import { ExcerptWriter } from './excerpt-writer.service';

/**
 * The `excerpt_selection` stage (F09). Loads the rules file and registers
 * its handler with the pipeline runner at module init; exports the reader
 * the transcript and F10 read selections through. The pronunciation focus
 * comes from F12's error ledger, through `ProfileModule`.
 */
@Module({
  imports: [PipelineModule, ProfileModule],
  providers: [
    ExcerptRulesService,
    ExcerptWriter,
    ExcerptSelectionReader,
    ExcerptSelectionStageHandler,
  ],
  exports: [ExcerptSelectionReader],
})
export class ExcerptSelectionModule {}
