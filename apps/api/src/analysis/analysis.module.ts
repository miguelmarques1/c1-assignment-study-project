import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { ProfileModule } from '../profile/profile.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { AnalysisInputBuilder } from './analysis-input.builder';
import { AnalysisResultWriter } from './analysis-result.writer';
import { AnalysisStageHandler } from './analysis-stage.handler';
import { LessonAnalysisReader } from './analysis-result.reader';

/**
 * The `lesson_analysis` stage (F11). Registers its handler with the
 * pipeline runner at module init; exports the reader F12 and F19 read an
 * analysis through. `PromptExecutionService` and `CredentialsService` are
 * both global (`PromptsModule`, `CredentialsModule`), so neither is imported
 * here.
 */
@Module({
  imports: [PipelineModule, PronunciationModule, ProfileModule, TaxonomyModule],
  providers: [AnalysisInputBuilder, AnalysisResultWriter, LessonAnalysisReader, AnalysisStageHandler],
  exports: [LessonAnalysisReader],
})
export class AnalysisModule {}
