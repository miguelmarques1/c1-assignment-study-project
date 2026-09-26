import { Module } from '@nestjs/common';

import { ErrorLedgerPort } from './error-ledger.port';
import { ProfileTagsPort } from './profile-tags.port';

/**
 * F12's future home. Today it holds only the seams earlier features call:
 * a participant's recurring weakness tags (F06, F11) and a tag's ledger
 * occurrence count (F19) — a single replacement point per question instead
 * of one per consumer.
 */
@Module({
  providers: [ProfileTagsPort, ErrorLedgerPort],
  exports: [ProfileTagsPort, ErrorLedgerPort],
})
export class ProfileModule {}
