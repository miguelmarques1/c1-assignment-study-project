import type { CefrLevel, ContentItemCandidate } from '@english-quest/shared';

import type { StudyPlanRules } from '../rules/plan-rules';
import type { PlanTagSource, RankedPlanTag } from './tag-priority';

export interface RankingContext {
  /** Every tag the user has not mastered, for eligibility. */
  unmasteredTags: ReadonlySet<string>;
  /** Tag → its ranking, from `rankPlanTags`. */
  tagPriority: ReadonlyMap<string, RankedPlanTag>;
  /** Preference order, index 0 tried first. */
  cefrLevels: readonly CefrLevel[];
  /** No unmastered tag at all (first lesson, no profile yet). */
  generalMode: boolean;
}

const TIER_OF: Record<PlanTagSource, number> = { due: 0, recurring: 1, unmastered: 2 };

/** A candidate's matching tags, each with its ranking — empty when nothing intersects. */
export function tagMatches(candidate: ContentItemCandidate, ctx: RankingContext): RankedPlanTag[] {
  return candidate.targetTags
    .map((tag) => ctx.tagPriority.get(tag))
    .filter((ranked): ranked is RankedPlanTag => ranked !== undefined);
}

/** The candidate's best-ranked matching tag, or null with nothing intersecting (always null in general mode). */
export function primaryTagOf(candidate: ContentItemCandidate, ctx: RankingContext): RankedPlanTag | null {
  if (ctx.generalMode) {
    return null;
  }
  const matches = tagMatches(candidate, ctx);
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((best, current) => {
    const bestTier = TIER_OF[best.source];
    const currentTier = TIER_OF[current.source];
    if (currentTier !== bestTier) {
      return currentTier < bestTier ? current : best;
    }
    return current.rank < best.rank ? current : best;
  });
}

/** Level in the allowed list, and (outside general mode) at least one tag intersecting the user's unmastered tags (spec A7, A27). */
export function isEligible(candidate: ContentItemCandidate, ctx: RankingContext): boolean {
  if (!ctx.cefrLevels.includes(candidate.cefrLevel)) {
    return false;
  }
  if (ctx.generalMode) {
    return true;
  }
  return candidate.targetTags.some((tag) => ctx.unmasteredTags.has(tag));
}

function compareCandidates(
  a: ContentItemCandidate,
  b: ContentItemCandidate,
  generationItemIds: ReadonlySet<string>,
  ctx: RankingContext,
): number {
  const generationRank = (candidate: ContentItemCandidate): number => (generationItemIds.has(candidate.id) ? 0 : 1);
  const generationDelta = generationRank(a) - generationRank(b);
  if (generationDelta !== 0) {
    return generationDelta;
  }

  if (!ctx.generalMode) {
    const matchesA = tagMatches(a, ctx);
    const matchesB = tagMatches(b, ctx);
    const tierA = matchesA.length > 0 ? Math.min(...matchesA.map((m) => TIER_OF[m.source])) : 2;
    const tierB = matchesB.length > 0 ? Math.min(...matchesB.map((m) => TIER_OF[m.source])) : 2;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    const rankA = matchesA.length > 0 ? Math.min(...matchesA.map((m) => m.rank)) : Number.MAX_SAFE_INTEGER;
    const rankB = matchesB.length > 0 ? Math.min(...matchesB.map((m) => m.rank)) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const topTenA = matchesA.filter((m) => m.rank <= 10).length;
    const topTenB = matchesB.filter((m) => m.rank <= 10).length;
    if (topTenA !== topTenB) {
      return topTenB - topTenA; // more top-10 matches sorts first
    }
  }

  const cefrIndex = (level: CefrLevel): number => {
    const index = ctx.cefrLevels.indexOf(level);
    return index === -1 ? ctx.cefrLevels.length : index;
  };
  const cefrDelta = cefrIndex(a.cefrLevel) - cefrIndex(b.cefrLevel);
  if (cefrDelta !== 0) {
    return cefrDelta;
  }

  return Math.abs(a.difficulty - 4) - Math.abs(b.difficulty - 4);
  // Ties fall through to Array.prototype.sort's stability, preserving F13's own order.
}

/** Eligible candidates, ordered by the spec §5 ranking key. Pure and deterministic. */
export function rankCandidates(
  candidates: readonly ContentItemCandidate[],
  generationItemIds: ReadonlySet<string>,
  ctx: RankingContext,
): ContentItemCandidate[] {
  return candidates
    .filter((candidate) => isEligible(candidate, ctx))
    .slice()
    .sort((a, b) => compareCandidates(a, b, generationItemIds, ctx));
}

export interface OfferEntry {
  /** `c01`…`c40`: what the prompt and the model's response reference instead of a UUID. */
  alias: string;
  candidate: ContentItemCandidate;
  isNewGenerated: boolean;
}

/**
 * Up to `offeredMax` candidates for the composition prompt: every item F14
 * produced for this run first, then the best-ranked eligible items per
 * type up to each type's offered cap (spec A7). `ranked` must already be
 * ordered by `rankCandidates` — generation items sort first there too, so
 * this only needs to enforce the per-type caps for the rest.
 */
export function buildOffer(
  ranked: readonly ContentItemCandidate[],
  generationItemIds: ReadonlySet<string>,
  rules: StudyPlanRules,
): OfferEntry[] {
  const offered: ContentItemCandidate[] = [];
  const seen = new Set<string>();
  const add = (candidate: ContentItemCandidate): void => {
    if (!seen.has(candidate.id) && offered.length < rules.candidates.offeredMax) {
      seen.add(candidate.id);
      offered.push(candidate);
    }
  };

  for (const candidate of ranked) {
    if (generationItemIds.has(candidate.id)) {
      add(candidate);
    }
  }

  const perTypeCounts: Partial<Record<ContentItemCandidate['type'], number>> = {};
  for (const candidate of ranked) {
    if (seen.has(candidate.id) || offered.length >= rules.candidates.offeredMax) {
      continue;
    }
    const cap = rules.candidates.offeredPerType[candidate.type];
    const count = perTypeCounts[candidate.type] ?? 0;
    if (count >= cap) {
      continue;
    }
    add(candidate);
    perTypeCounts[candidate.type] = count + 1;
  }

  return offered.map((candidate, index) => ({
    alias: `c${String(index + 1).padStart(2, '0')}`,
    candidate,
    isNewGenerated: generationItemIds.has(candidate.id),
  }));
}
