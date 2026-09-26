import { Injectable } from '@nestjs/common';

import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { ErrorLedgerReader } from './error-ledger.reader';
import { PROFILE_TAGS_LIMIT } from './profile.constants';

/**
 * The seam F06's role-card prompt and F11's analysis prompt both call for a
 * participant's weakness tags (F12). It returns the owner's recurring
 * weaknesses — unmastered, non-retired, at least 3 occurrences in the last
 * 30 days, ranked — from the analysis families only, at most 10: a phoneme
 * is neither an expression a role card can target nor a tag F11's schema
 * accepts, so the `string[]` both prompts already take stays exactly what
 * they expect. An owner with no recurring weakness still gets an empty
 * list, which both prompts treat as "no profile yet".
 */
@Injectable()
export class ProfileTagsPort {
  constructor(
    private readonly ledger: ErrorLedgerReader,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  async weaknessTagsFor(userId: string): Promise<string[]> {
    const recurring = await this.ledger.recurringFor(userId);
    return recurring
      .map((entry) => entry.tag)
      .filter((tag) => this.taxonomy.isAnalysisTag(tag))
      .slice(0, PROFILE_TAGS_LIMIT);
  }
}
