import type { GeneratedContentType } from '@english-quest/shared';

import type { SlotDraft } from './batch-planner';
import { pickGenres, type Rng } from './genre-picker';

export interface PlannedSlot extends SlotDraft {
  genre: string | null;
  topicDomain: string;
  exemplarIndex: number;
}

export interface DecorationInput {
  /** The user's generated readings' genres, most recent first. */
  genreHistory: readonly string[];
  genres: readonly string[];
  /** F06's vocabulary domains: the variation seed each slot draws from (spec A14). */
  domains: readonly string[];
  /** How many style exemplars each type's prompt carries. */
  exemplarCounts: Readonly<Record<GeneratedContentType, number>>;
  /** How many slots of each type the user has had in earlier runs, for the rotation (spec A16). */
  priorSlotsByType: Readonly<Partial<Record<GeneratedContentType, number>>>;
  rng: Rng;
}

/** Fisher–Yates with the injected RNG. */
function shuffled<T>(values: readonly T[], rng: Rng): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

/**
 * Adds to each planned slot what varies its output: a genre per reading
 * (with the five-reading window), a topic domain per slot, distinct within
 * the run while the 15 domains last, and the style exemplar it will be
 * shown, rotating per user and type so consecutive generations see
 * different exemplars. Both attempts of a slot keep all three.
 */
export function decorateSlots(drafts: readonly SlotDraft[], input: DecorationInput): PlannedSlot[] {
  const readingCount = drafts.filter((draft) => draft.type === 'reading').length;
  const genres = pickGenres(readingCount, input.genreHistory, input.genres, input.rng);
  const domains = shuffled(input.domains, input.rng);
  const seenOfType: Partial<Record<GeneratedContentType, number>> = {};
  let readingIndex = 0;

  return drafts.map((draft, index) => {
    const withinRun = seenOfType[draft.type] ?? 0;
    seenOfType[draft.type] = withinRun + 1;
    const exemplarCount = Math.max(1, input.exemplarCounts[draft.type]);
    return {
      ...draft,
      genre: draft.type === 'reading' ? (genres[readingIndex++] ?? null) : null,
      topicDomain: domains[index % domains.length]!,
      exemplarIndex: ((input.priorSlotsByType[draft.type] ?? 0) + withinRun) % exemplarCount,
    };
  });
}
