import { Module } from '@nestjs/common';

import { ProfileModule } from '../profile/profile.module';
import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ContentGenerationService } from './content-generation.service';
import { FrequencyListService } from './frequency-list.service';
import { GenerationRulesService } from './generation-rules.service';
import { GenerationRunRepository } from './generation-run.repository';
import { SlotGeneratorService } from './slot-generator.service';

/**
 * AI content generation with the difficulty gate (F14). F15 calls
 * `ContentGenerationService.generateForPlan` once per study plan. The
 * frequency list and the rules are loaded when this module initializes, so
 * a missing or invalid file stops the API before it serves anything.
 * Prompts, credentials, the content bank and Prisma come from their global
 * modules; the ledger readers from `ProfileModule`.
 */
@Module({
  imports: [TaxonomyModule, ProfileModule],
  providers: [FrequencyListService, GenerationRulesService, GenerationRunRepository, SlotGeneratorService, ContentGenerationService],
  exports: [ContentGenerationService, FrequencyListService, GenerationRulesService],
})
export class GenerationModule {}
