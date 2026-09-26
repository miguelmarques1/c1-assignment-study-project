import { Module } from '@nestjs/common';

import { AnalysisModule } from '../analysis/analysis.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { LessonHistoryService } from './lesson-history.service';
import { LessonsController } from './lessons.controller';

/**
 * The lesson history (F19): `GET /lessons` and `GET /lessons/:lessonId`.
 * Reads the caller's score timelines through F10's and F11's own readers
 * rather than their tables, and the participant check through F08's
 * `LessonAccessService`.
 */
@Module({
  imports: [PipelineModule, AnalysisModule, PronunciationModule],
  controllers: [LessonsController],
  providers: [LessonHistoryService],
})
export class LessonsModule {}
