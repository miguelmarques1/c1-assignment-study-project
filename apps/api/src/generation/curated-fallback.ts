import type { ContentItemCandidate, GeneratedContentType } from '@english-quest/shared';

import type { ContentBankService } from '../content/content-bank.service';
import { GENERATED_CEFR_LEVEL } from './generated-item.mapper';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TARGET_DIFFICULTY = 4;

function cefrDistance(level: string): number {
  return Math.abs(CEFR_ORDER.indexOf(level) - CEFR_ORDER.indexOf(GENERATED_CEFR_LEVEL));
}

/**
 * Orders curated candidates for a slot (spec A6): most of the slot's tags,
 * then any of the learner's unmastered tags, then closest to C1, then
 * closest to difficulty 4, then the bank's own order. Pure.
 */
export function rankFallbackCandidates(
  candidates: readonly ContentItemCandidate[],
  slotTags: readonly string[],
  unmastered: ReadonlySet<string>,
): ContentItemCandidate[] {
  const score = (candidate: ContentItemCandidate) => ({
    slotTags: candidate.targetTags.filter((tag) => slotTags.includes(tag)).length,
    unmastered: candidate.targetTags.some((tag) => unmastered.has(tag)) ? 1 : 0,
    cefr: cefrDistance(candidate.cefrLevel),
    difficulty: Math.abs(candidate.difficulty - TARGET_DIFFICULTY),
  });
  return candidates
    .map((candidate, order) => ({ candidate, order, score: score(candidate) }))
    .sort(
      (a, b) =>
        b.score.slotTags - a.score.slotTags ||
        b.score.unmastered - a.score.unmastered ||
        a.score.cefr - b.score.cefr ||
        a.score.difficulty - b.score.difficulty ||
        a.order - b.order,
    )
    .map((entry) => entry.candidate);
}

/**
 * A curated bank item of the slot's type to stand in for an item that could
 * not be generated (PRD F14), or null when the bank has none (always null
 * for error review, which is never curated). F13's 30-day served
 * exclusion applies, and an item already standing in for another slot of
 * this run is skipped.
 */
export async function selectCuratedFallback(
  bank: ContentBankService,
  userId: string,
  slot: { type: GeneratedContentType; targetTags: readonly string[] },
  unmastered: ReadonlySet<string>,
  alreadyUsed: ReadonlySet<string>,
): Promise<string | null> {
  if (slot.type === 'error_review') {
    return null;
  }
  const candidates = await bank.findCandidates({ userId, types: [slot.type], provenance: 'curated', limit: 500 });
  const ranked = rankFallbackCandidates(
    candidates.filter((candidate) => !alreadyUsed.has(candidate.id)),
    slot.targetTags,
    unmastered,
  );
  return ranked[0]?.id ?? null;
}
