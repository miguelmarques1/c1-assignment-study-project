import { Module } from '@nestjs/common';

import { ContentModule } from '../../content/content.module';
import { CredentialsModule } from '../../credentials/credentials.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProfileModule } from '../../profile/profile.module';
import { PromptsModule } from '../../prompts/prompts.module';
import { TaxonomyModule } from '../../taxonomy/taxonomy.module';
import { GenerationModule } from '../generation.module';

/**
 * What `content:generate` needs and nothing more: the vault, the prompt
 * library, the ledger readers, the content bank and generation itself. No
 * HTTP server, no BullMQ workers and no scheduler (without
 * `ScheduleModule.forRoot` the vault's daily cron stays inert), so running
 * the CLI never competes with the API for queue jobs.
 */
@Module({
  imports: [PrismaModule, CredentialsModule, PromptsModule, TaxonomyModule, ProfileModule, ContentModule, GenerationModule],
})
export class GenerationCliModule {}
