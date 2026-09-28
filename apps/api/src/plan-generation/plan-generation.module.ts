import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { PlansModule } from '../plans/plans.module';
import { PlanGenerationStageHandler } from './plan-generation-stage.handler';
import { PlanRequestJob } from './plan-request.job';

/**
 * The two build paths that run outside the pipeline's own transaction: the
 * `plan_generation` stage handler (every profiled branch already waits
 * for it) and the request job (F07's fallback, and the interim plan for
 * an analysis blocked on Gemini). `PlanRequestRepository` itself is a
 * provider of `PlansModule` (see that module's doc comment for why), so
 * this module only ever depends on `PlansModule`, never the reverse.
 */
@Module({
  imports: [PipelineModule, PlansModule],
  providers: [PlanGenerationStageHandler, PlanRequestJob],
})
export class PlanGenerationModule {}
