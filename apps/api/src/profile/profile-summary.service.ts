import { Injectable } from '@nestjs/common';

import { ErrorLedgerReader } from './error-ledger.reader';
import { LearningProfileReader } from './learning-profile.reader';
import { renderCompactSummary, type CompactSummary } from './profile-summary';
import { SUMMARY_WEAKNESS_LIMIT } from './profile.constants';

/**
 * The compact profile summary for prompts (F12): six scores, up to 10
 * recurring weaknesses and up to 6 of the learner's own examples, within
 * 1,500 estimated tokens. It carries one user's data, so it is only ever
 * passed to a prompt executed under that same user's key (F14, F15).
 */
@Injectable()
export class ProfileSummaryService {
  constructor(
    private readonly profile: LearningProfileReader,
    private readonly ledger: ErrorLedgerReader,
  ) {}

  async compactSummaryFor(userId: string, now: Date = new Date()): Promise<CompactSummary> {
    const snapshot = await this.profile.snapshotFor(userId, now);
    const weaknesses = snapshot.recurringWeaknesses.slice(0, SUMMARY_WEAKNESS_LIMIT);
    const examples = await this.ledger.latestExamples(
      userId,
      weaknesses.map((weakness) => weakness.tag),
    );
    return renderCompactSummary(snapshot.competencies, weaknesses, examples);
  }
}
