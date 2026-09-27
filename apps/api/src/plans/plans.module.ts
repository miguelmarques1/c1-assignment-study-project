import { Module } from '@nestjs/common';

import { GenerationModule } from '../generation/generation.module';
import { ProfileModule } from '../profile/profile.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { PlanActivationService } from './plan-activation.service';
import { PlanComposerService } from './plan-composer.service';
import { PlanRulesService } from './plan-rules.service';
import { PlanSupersessionService } from './plan-supersession.service';
import { PlanRepository } from './plan.repository';

/**
 * Study plan composition and activation (F15). F14's generation and the
 * F12 readers come from their own modules; prompts, credentials, content
 * and Prisma are global. The rules file is loaded when this module
 * initializes, so an invalid file stops the API before it serves anything.
 * `PlanGenerationModule` (the pipeline stage and the request job) and the
 * HTTP surface import this module for its exports.
 */
@Module({
  imports: [TaxonomyModule, ProfileModule, GenerationModule],
  providers: [PlanRulesService, PlanRepository, PlanComposerService, PlanSupersessionService, PlanActivationService],
  exports: [PlanRulesService, PlanRepository, PlanComposerService, PlanSupersessionService, PlanActivationService],
})
export class PlansModule {}
