import { Module } from '@nestjs/common';

import { ExcerptSelectionModule } from '../excerpts/excerpt-selection.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { SpeechModule } from '../speech/speech.module';
import { StorageModule } from '../storage/storage.module';
import { ExcerptAssessmentStore } from './excerpt-assessment.store';
import { ExcerptClipSlicer } from './excerpt-clip.slicer';
import { PronunciationResultReader } from './pronunciation-result.reader';
import { PronunciationResultWriter } from './pronunciation-result.writer';
import { PronunciationStageHandler } from './pronunciation-stage.handler';
import { PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE, PRONUNCIATION_WORK_ROOT } from './pronunciation.constants';

/**
 * The `pronunciation_assessment` stage (F10). Registers its handler with
 * the pipeline runner at module init; F19's route is added here in a later
 * stage of this feature's own implementation. Exports the reader F11 and
 * F12 will read the aggregate through.
 *
 * `PRONUNCIATION_WORK_ROOT` and `PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE`
 * are provided here as `undefined` (the handler's own constructor defaults
 * take over) purely so a test's `overrideProvider` has an existing binding
 * to replace — Nest's testing override cannot swap a token that was never
 * registered anywhere in the module graph.
 */
@Module({
  imports: [PipelineModule, SpeechModule, ExcerptSelectionModule, StorageModule],
  providers: [
    ExcerptClipSlicer,
    ExcerptAssessmentStore,
    PronunciationResultWriter,
    PronunciationResultReader,
    PronunciationStageHandler,
    { provide: PRONUNCIATION_WORK_ROOT, useValue: undefined },
    { provide: PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE, useValue: undefined },
  ],
  exports: [PronunciationResultReader],
})
export class PronunciationModule {}
