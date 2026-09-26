import { Injectable } from '@nestjs/common';

/**
 * F12's ledger seam, beside `ProfileTagsPort`. F19's analysis view asks it
 * how many times the caller's ledger has recorded each tag, from sources up
 * to and including this lesson, to show a recurrence badge. No ledger exists
 * yet, so the answer is an empty map (every count unknown) and no badge
 * renders. F12 replaces this implementation without reopening F19.
 */
@Injectable()
export class ErrorLedgerPort {
  async occurrencesThrough(_userId: string, _lessonId: string, _tags: readonly string[]): Promise<Map<string, number>> {
    return new Map();
  }
}
