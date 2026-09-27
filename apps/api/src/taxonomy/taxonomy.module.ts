import { Module } from '@nestjs/common';

import { ErrorTaxonomyService } from './error-taxonomy.service';

/**
 * The error taxonomy (F11). Loads the versioned taxonomy file at module init
 * and exports the service every tag lookup goes through — F11's analysis
 * prompt and output rules, F12's ledger (membership, families and labels),
 * and later F14 and F17 (tag labels).
 */
@Module({
  providers: [ErrorTaxonomyService],
  exports: [ErrorTaxonomyService],
})
export class TaxonomyModule {}
