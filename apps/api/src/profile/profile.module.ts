import { Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { ErrorLedgerPort } from './error-ledger.port';
import { ErrorLedgerReader } from './error-ledger.reader';
import { LearningProfileReader } from './learning-profile.reader';
import { ProfileIngestionService } from './profile-ingestion.service';
import { ProfileSummaryService } from './profile-summary.service';
import { ProfileTagsPort } from './profile-tags.port';
import { PronunciationFocusPort } from './pronunciation-focus.port';

/** Everything other features read or call; each is exported as well as provided. */
const SHARED = [
  ProfileIngestionService,
  LearningProfileReader,
  ErrorLedgerReader,
  ProfileSummaryService,
  ProfileTagsPort,
  PronunciationFocusPort,
  ErrorLedgerPort,
];

/**
 * The learning profile and error ledger (F12): the ingestion engine every
 * source goes through (lessons through `ProfileUpdateModule`, activities
 * through the outcome ingestion contract F16–F18 call), the readers and the
 * compact summary, and the seams earlier features call: `ProfileTagsPort`
 * (F06, F11), `PronunciationFocusPort` (F09) and `ErrorLedgerPort` (F19).
 * Imports only the taxonomy (and the global Prisma), so `AnalysisModule`
 * and `ExcerptSelectionModule` can import it without a cycle — which is why
 * the stage that reads F11's analysis lives in `ProfileUpdateModule`.
 */
@Module({
  imports: [TaxonomyModule],
  providers: SHARED,
  exports: SHARED,
})
export class ProfileModule {}
