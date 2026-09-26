import { Global, Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ContentBankService } from './content-bank.service';

/**
 * @Global() like PromptsModule and CredentialsModule: F14, F15 and F16 each
 * reach the content bank from their own modules without importing this one.
 * TaxonomyModule is imported here because it is not global and
 * `saveGenerated` validates tags against the taxonomy in force.
 */
@Global()
@Module({
  imports: [TaxonomyModule],
  providers: [ContentBankService],
  exports: [ContentBankService],
})
export class ContentModule {}
