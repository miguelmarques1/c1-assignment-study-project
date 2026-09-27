import { Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { FrequencyListService } from './frequency-list.service';
import { GenerationRulesService } from './generation-rules.service';

/**
 * AI content generation with the difficulty gate (F14). The frequency list
 * and the rules are loaded when this module initializes, so a missing or
 * invalid file stops the API before it serves anything.
 */
@Module({
  imports: [TaxonomyModule],
  providers: [FrequencyListService, GenerationRulesService],
  exports: [FrequencyListService, GenerationRulesService],
})
export class GenerationModule {}
