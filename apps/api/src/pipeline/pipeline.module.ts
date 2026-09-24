import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { LessonAccessService } from './lesson-access.service';
import { PIPELINE_QUEUE } from './pipeline.constants';
import { PipelineDrainJob } from './pipeline-drain.job';
import { PipelineQueueService } from './pipeline-queue.service';
import { PIPELINE_RETRY_OVERRIDES, PipelineStageRegistry } from './pipeline-stage.registry';
import { PipelineStateService } from './pipeline-state.service';
import { PipelineController } from './pipeline.controller';
import { PipelineProcessor } from './pipeline.processor';
import { PipelineService } from './pipeline.service';

/**
 * The generic post-lesson pipeline runner. Stage features import this
 * module and register a handler with `PipelineStageRegistry`; they never
 * bring their own queue, retry route or blocked state.
 */
@Module({
  imports: [BullModule.registerQueue({ name: PIPELINE_QUEUE })],
  controllers: [PipelineController],
  providers: [
    { provide: PIPELINE_RETRY_OVERRIDES, useValue: {} },
    PipelineStageRegistry,
    PipelineStateService,
    PipelineQueueService,
    PipelineProcessor,
    PipelineDrainJob,
    PipelineService,
    LessonAccessService,
  ],
  exports: [PipelineService, PipelineStageRegistry, PipelineStateService, LessonAccessService],
})
export class PipelineModule {}
