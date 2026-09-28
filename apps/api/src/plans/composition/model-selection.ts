import type { ContentItemCandidate } from '@english-quest/shared';

import type { StudyPlanRules } from '../rules/plan-rules';
import { isEligible, type OfferEntry, type RankingContext } from './candidate-ranking';
import { acceptModelRationale } from './rationale';

export interface ModelSelectionEntry {
  ref: string;
  rationale: string;
}

export interface ModelOutput {
  selections: readonly ModelSelectionEntry[];
}

export interface AcceptedSelection {
  candidate: ContentItemCandidate;
  /** The model's own sentence, kept only when it passes `acceptModelRationale`; null falls back to a template. */
  rationale: string | null;
}

export interface SelectionStats {
  offered: number;
  returned: number;
  accepted: number;
  rejected: { unknown: number; duplicate: number; offTarget: number };
}

export interface ValidatedSelection {
  /** Empty when `discard` is true. */
  accepted: AcceptedSelection[];
  stats: SelectionStats;
  discard: boolean;
}

/**
 * Turns the model's raw `{ ref, rationale }` list into candidates the
 * composer can place, rejecting an unknown ref, a repeat, or (defensively —
 * unreachable for an offered item) one that no longer intersects the
 * user's unmastered tags. More than half of the returned entries rejected
 * discards the whole output (spec A8, PRD's "if more than half the
 * selections are invalid, the model's output is discarded entirely").
 */
export function validateSelection(
  output: ModelOutput,
  offer: readonly OfferEntry[],
  ctx: RankingContext,
  rules: StudyPlanRules,
): ValidatedSelection {
  const byAlias = new Map(offer.map((entry) => [entry.alias, entry]));
  const seen = new Set<string>();
  const accepted: AcceptedSelection[] = [];
  let unknown = 0;
  let duplicate = 0;
  let offTarget = 0;

  const limited = output.selections.slice(0, rules.model.selections.max);
  for (const entry of limited) {
    const offered = byAlias.get(entry.ref);
    if (!offered) {
      unknown += 1;
      continue;
    }
    if (seen.has(offered.candidate.id)) {
      duplicate += 1;
      continue;
    }
    if (!isEligible(offered.candidate, ctx)) {
      offTarget += 1;
      continue;
    }
    seen.add(offered.candidate.id);
    accepted.push({ candidate: offered.candidate, rationale: acceptModelRationale(entry.rationale, rules) });
  }

  const returned = output.selections.length;
  const rejectedTotal = unknown + duplicate + offTarget;
  const discard = returned > 0 && rejectedTotal / returned > rules.model.invalidShareToDiscard;

  return {
    accepted: discard ? [] : accepted,
    stats: {
      offered: offer.length,
      returned,
      accepted: discard ? 0 : accepted.length,
      rejected: { unknown, duplicate, offTarget },
    },
    discard,
  };
}
