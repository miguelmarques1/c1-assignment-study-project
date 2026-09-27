import type { GeneratedContentType } from '@english-quest/shared';

import { GENERATED_ITEM_TYPES } from '../rules/generation-rules';
import type { RankedTag, TagSource } from './tag-ranking';

export interface SlotDraft {
  /** 1-based, plan order. */
  position: number;
  type: GeneratedContentType;
  targetTags: string[];
  tagSources: Array<{ tag: string; source: TagSource; rank: number }>;
}

export interface BatchPlanInput {
  ranked: readonly RankedTag[];
  maxItems: number;
  mix: Readonly<Record<GeneratedContentType, number>>;
  maxItemsPerTag: number;
  /** How many tags each type's item carries (the rules' `target_tags`). */
  tagsPerItem: Readonly<Record<GeneratedContentType, { min: number; max: number }>>;
}

/** The mix, allocated one of each type in turn (spec A9), so a smaller `maxItems` stays balanced. */
export function typeSequence(mix: Readonly<Record<GeneratedContentType, number>>, maxItems: number): GeneratedContentType[] {
  const remaining = { ...mix };
  const sequence: GeneratedContentType[] = [];
  while (sequence.length < maxItems && GENERATED_ITEM_TYPES.some((type) => remaining[type] > 0)) {
    for (const type of GENERATED_ITEM_TYPES) {
      if (remaining[type] > 0 && sequence.length < maxItems) {
        sequence.push(type);
        remaining[type] -= 1;
      }
    }
  }
  return sequence;
}

/** Which tags an item type can be built around (spec A9). */
function compatible(type: GeneratedContentType, tag: RankedTag): boolean {
  switch (type) {
    case 'grammar':
      return tag.family === 'grammar';
    case 'vocabulary':
      return tag.family === 'vocab';
    case 'error_review':
      return tag.hasQuote;
    case 'reading':
      return true;
  }
}

/**
 * The deterministic slot plan (spec A9). Types come round-robin from the
 * mix. Each slot takes the compatible tag used least in this run, the
 * best-ranked among equals, so a batch spreads across the learner's
 * weaknesses instead of stacking one tag, and no tag appears in more than
 * `maxItemsPerTag` items. A reading takes a second tag, preferring another
 * family. A grammar, vocabulary or error-review slot with nothing to target
 * becomes a reading, and planning stops once no tag has uses left, so a
 * small ledger yields a smaller batch rather than a repetitive one. Pure.
 */
export function planBatch(input: BatchPlanInput): SlotDraft[] {
  if (input.ranked.length === 0) {
    return [];
  }
  const usage = new Map<string, number>();
  const available = (tag: RankedTag): boolean => (usage.get(tag.tag) ?? 0) < input.maxItemsPerTag;
  const pick = (candidates: RankedTag[]): RankedTag | undefined =>
    [...candidates].sort((a, b) => (usage.get(a.tag) ?? 0) - (usage.get(b.tag) ?? 0) || a.rank - b.rank)[0];

  const drafts: SlotDraft[] = [];
  for (const planned of typeSequence(input.mix, input.maxItems)) {
    let type = planned;
    let first = pick(input.ranked.filter((tag) => compatible(type, tag) && available(tag)));
    if (!first && type !== 'reading') {
      type = 'reading';
      first = pick(input.ranked.filter(available));
    }
    if (!first) {
      break;
    }

    const chosen = [first];
    if (input.tagsPerItem[type].max >= 2) {
      const others = input.ranked.filter((tag) => tag.tag !== first.tag && compatible(type, tag) && available(tag));
      const second = pick(others.filter((tag) => tag.family !== first.family)) ?? pick(others);
      if (second) {
        chosen.push(second);
      }
    }
    for (const tag of chosen) {
      usage.set(tag.tag, (usage.get(tag.tag) ?? 0) + 1);
    }
    drafts.push({
      position: drafts.length + 1,
      type,
      targetTags: chosen.map((tag) => tag.tag),
      tagSources: chosen.map((tag) => ({ tag: tag.tag, source: tag.source, rank: tag.rank })),
    });
  }
  return drafts;
}
