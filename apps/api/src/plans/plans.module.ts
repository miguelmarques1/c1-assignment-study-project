import { Module } from '@nestjs/common';

import { GenerationModule } from '../generation/generation.module';
import { PlanRequestRepository } from '../plan-generation/plan-request.repository';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProfileModule } from '../profile/profile.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { PlanActivationService } from './plan-activation.service';
import { PlanActivityStateService } from './plan-activity-state.service';
import { PlanComposerService } from './plan-composer.service';
import { PlanHistoryReader } from './plan-history.reader';
import { PlanReadService } from './plan-read.service';
import { PlanRetryService } from './plan-retry.service';
import { PlanRulesService } from './plan-rules.service';
import { PlanSupersessionService } from './plan-supersession.service';
import { PlanRepository } from './plan.repository';
import { PlansController } from './plans.controller';

/**
 * Study plan composition, activation and the HTTP surface (F15). F14's
 * generation and the F12 readers come from their own modules; prompts,
 * credentials, content and Prisma are global. The rules file is loaded
 * when this module initializes, so an invalid file stops the API before it
 * serves anything.
 *
 * `PlanRequestRepository` lives here (not in `PlanGenerationModule`,
 * despite being a plan-generation.js file) specifically so the dependency
 * only ever runs one way: `PlanGenerationModule` and `RecordingModule`
 * (for F07's `StudyPlanFallbackPort`) both import this module, and this
 * module imports neither of them — importing `PlanGenerationModule` here
 * for the repository would close a cycle.
 */
@Module({
  imports: [TaxonomyModule, ProfileModule, GenerationModule, PipelineModule],
  controllers: [PlansController],
  providers: [
    PlanRulesService,
    PlanRepository,
    PlanRequestRepository,
    PlanComposerService,
    PlanSupersessionService,
    PlanActivationService,
    PlanActivityStateService,
    PlanHistoryReader,
    PlanReadService,
    PlanRetryService,
  ],
  exports: [
    PlanRulesService,
    PlanRepository,
    PlanRequestRepository,
    PlanComposerService,
    PlanSupersessionService,
    PlanActivationService,
    PlanActivityStateService,
    PlanHistoryReader,
    PlanReadService,
  ],
})
export class PlansModule {}
