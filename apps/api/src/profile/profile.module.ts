import { Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ErrorLedgerReader } from './error-ledger.reader';
import { LearningProfileReader } from './learning-profile.reader';
import { ProfileIngestionService } from './profile-ingestion.service';
import { ProfileSummaryService } from './profile-summary.service';
import { ProfileTagsPort } from './profile-tags.port';

/**
 * The learning profile and error ledger (F12): the ingestion engine every
 * source goes through (lessons through `ProfileUpdateModule`, activities
 * through the outcome ingestion contract F16–F18 call), the readers and the
 * compact summary, and the seams earlier features call. Imports only the
 * taxonomy (and the global Prisma), so `AnalysisModule` can import it for
 * `ProfileTagsPort` without a cycle — which is why the stage that reads
 * F11's analysis lives in `ProfileUpdateModule` instead.
 */
@Module({
  imports: [TaxonomyModule],
  providers: [ProfileIngestionService, LearningProfileReader, ErrorLedgerReader, ProfileSummaryService, ProfileTagsPort],
  exports: [ProfileIngestionService, LearningProfileReader, ErrorLedgerReader, ProfileSummaryService, ProfileTagsPort],
})
export class ProfileModule {}
