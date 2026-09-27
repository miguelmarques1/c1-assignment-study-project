import type { GeneratedContentType } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { planBatch, typeSequence } from '../../src/generation/planning/batch-planner';
import { decorateSlots } from '../../src/generation/planning/slot-decorations';
import { rankTags, type RankableEntry, type TagRankingInput } from '../../src/generation/planning/tag-ranking';

const MIX = { reading: 3, grammar: 3, vocabulary: 3, error_review: 3 };
const TAGS_PER_ITEM = {
  reading: { min: 1, max: 2 },
  vocabulary: { min: 1, max: 1 },
  grammar: { min: 1, max: 1 },
  error_review: { min: 1, max: 1 },
};
const FAMILIES = new Set(['grammar', 'vocab', 'discourse']);

function entry(tag: string, occurrenceCount: number, daysAgo = 1, dueAt: Date | null = null): RankableEntry {
  return { tag, family: tag.split(':')[0]!, occurrenceCount, lastSeenAt: new Date(Date.UTC(2026, 8, 27 - daysAgo)), dueAt };
}

function rankingInput(entries: RankableEntry[], overrides: Partial<TagRankingInput> = {}): TagRankingInput {
  return {
    unmasteredTags: entries.map((candidate) => candidate.tag),
    entries,
    recurringTags: [],
    due: [],
    quotedTags: new Set(entries.map((candidate) => candidate.tag)),
    eligibleFamilies: FAMILIES,
    ...overrides,
  };
}

const RICH_LEDGER = [
  entry('grammar:conditional-3', 9),
  entry('grammar:passive-voice', 7),
  entry('grammar:article-definite', 6),
  entry('vocab:collocation', 8),
  entry('vocab:phrasal-verb', 5),
  entry('vocab:idiom', 5, 3),
  entry('vocab:word-choice', 4, 5),
  entry('discourse:connector', 4),
  entry('discourse:hedging', 3),
  entry('grammar:present-perfect', 2),
];

function plan(entries: RankableEntry[], maxItems = 12, overrides: Partial<TagRankingInput> = {}) {
  return planBatch({ ranked: rankTags(rankingInput(entries, overrides)), maxItems, mix: MIX, maxItemsPerTag: 2, tagsPerItem: TAGS_PER_ITEM });
}

/** mulberry32: a small seeded PRNG, so draws are repeatable. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('batch planner', () => {
  it('never_plans_more_than_twelve_slots', () => {
    const big = Array.from({ length: 30 }, (_, index) => entry(`grammar:tag-${index}`, 30 - index));

    expect(plan([...RICH_LEDGER, ...big])).toHaveLength(12);
    expect(planBatch({ ranked: rankTags(rankingInput(RICH_LEDGER)), maxItems: 12, mix: { reading: 12, grammar: 12, vocabulary: 12, error_review: 12 }, maxItemsPerTag: 12, tagsPerItem: TAGS_PER_ITEM })).toHaveLength(12);
  });

  it('allocates_the_mix_round_robin', () => {
    expect(typeSequence(MIX, 12)).toEqual([
      'reading', 'grammar', 'vocabulary', 'error_review',
      'reading', 'grammar', 'vocabulary', 'error_review',
      'reading', 'grammar', 'vocabulary', 'error_review',
    ]);
    expect(plan(RICH_LEDGER).map((slot) => slot.type)).toEqual(typeSequence(MIX, 12));
  });

  it('scales_the_mix_down_for_a_smaller_max', () => {
    expect(typeSequence(MIX, 5)).toEqual(['reading', 'grammar', 'vocabulary', 'error_review', 'reading']);
    expect(typeSequence({ reading: 1, grammar: 0, vocabulary: 2, error_review: 0 }, 12)).toEqual(['reading', 'vocabulary', 'vocabulary']);
  });

  it('ranks_due_then_recurring_then_other_unmastered_tags', () => {
    const due = entry('discourse:hedging', 3, 1, new Date(Date.UTC(2026, 8, 20)));
    const ranked = rankTags(
      rankingInput(RICH_LEDGER, { due: [due], recurringTags: ['vocab:collocation', 'grammar:passive-voice'] }),
    );

    expect(ranked.slice(0, 4).map((tag) => [tag.tag, tag.source, tag.rank])).toEqual([
      ['discourse:hedging', 'due', 1],
      ['vocab:collocation', 'recurring', 2],
      ['grammar:passive-voice', 'recurring', 3],
      ['grammar:conditional-3', 'unmastered', 4],
    ]);
  });

  it('excludes_phoneme_retired_and_mastered_tags', () => {
    const entries = [...RICH_LEDGER, entry('phoneme:/θ/', 20)];
    const unmastered = entries.map((candidate) => candidate.tag).filter((tag) => tag !== 'grammar:conditional-3');
    const ranked = rankTags(rankingInput(entries, { unmasteredTags: unmastered, eligibleFamilies: FAMILIES }));

    expect(ranked.map((tag) => tag.tag)).not.toContain('phoneme:/θ/');
    // Mastered (absent from unmastered) and retired (absent from entries) tags never rank.
    expect(ranked.map((tag) => tag.tag)).not.toContain('grammar:conditional-3');
    expect(rankTags(rankingInput(RICH_LEDGER, { unmasteredTags: ['grammar:retired-tag'] }))).toEqual([]);
  });

  it('matches_tag_families_to_item_types', () => {
    for (const slot of plan(RICH_LEDGER)) {
      if (slot.type === 'grammar') {
        expect(slot.targetTags.every((tag) => tag.startsWith('grammar:'))).toBe(true);
      }
      if (slot.type === 'vocabulary') {
        expect(slot.targetTags.every((tag) => tag.startsWith('vocab:'))).toBe(true);
      }
    }
    const readings = plan(RICH_LEDGER).filter((slot) => slot.type === 'reading');
    expect(readings.every((slot) => slot.targetTags.length === 2)).toBe(true);
    // The second tag prefers another family.
    expect(readings.every((slot) => slot.targetTags[0]!.split(':')[0] !== slot.targetTags[1]!.split(':')[0])).toBe(true);
  });

  it('a_type_without_compatible_tags_becomes_a_reading', () => {
    const onlyGrammar = [entry('grammar:conditional-3', 5), entry('grammar:passive-voice', 4), entry('grammar:article-definite', 3), entry('grammar:modal-verb', 2)];
    const slots = plan(onlyGrammar);

    expect(slots.some((slot) => slot.type === 'vocabulary')).toBe(false);
    expect(slots[2]?.type).toBe('reading');
  });

  it('uses_a_tag_in_at_most_two_items_and_prefers_unused_tags', () => {
    const uses = new Map<string, number>();
    for (const tag of plan(RICH_LEDGER).flatMap((slot) => slot.targetTags)) {
      uses.set(tag, (uses.get(tag) ?? 0) + 1);
    }
    expect(Math.max(...uses.values())).toBeLessThanOrEqual(2);

    // Within one family, every tag is used once, best-ranked first, before any is used twice.
    const grammar = [entry('grammar:conditional-3', 9), entry('grammar:passive-voice', 7), entry('grammar:article-definite', 5)];
    const slots = planBatch({
      ranked: rankTags(rankingInput(grammar)),
      maxItems: 6,
      mix: { reading: 0, grammar: 6, vocabulary: 0, error_review: 0 },
      maxItemsPerTag: 2,
      tagsPerItem: TAGS_PER_ITEM,
    });
    expect(slots.map((slot) => slot.targetTags[0])).toEqual([
      'grammar:conditional-3', 'grammar:passive-voice', 'grammar:article-definite',
      'grammar:conditional-3', 'grammar:passive-voice', 'grammar:article-definite',
    ]);
  });

  it('error_review_requires_a_tag_with_a_quoted_example', () => {
    const slots = plan(RICH_LEDGER, 12, { quotedTags: new Set(['discourse:hedging']) });
    const reviews = slots.filter((slot) => slot.type === 'error_review');

    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((slot) => slot.targetTags[0] === 'discourse:hedging')).toBe(true);
    expect(reviews.length).toBeLessThanOrEqual(2);
  });

  it('plans_nothing_without_eligible_tags', () => {
    expect(plan([])).toEqual([]);
    expect(plan([entry('phoneme:/θ/', 9)])).toEqual([]);
  });

  it('stops_planning_when_no_tag_has_uses_left', () => {
    const slots = plan([entry('grammar:conditional-3', 5), entry('vocab:collocation', 4)]);

    // Two tags × two uses each = four uses; readings take two at a time.
    expect(slots.flatMap((slot) => slot.targetTags)).toHaveLength(4);
    expect(slots.length).toBeLessThan(12);
  });

  it('every_slot_tag_is_unmastered_and_never_listening', () => {
    const rng = seeded(7);
    const pool = RICH_LEDGER.map((candidate) => candidate.tag);
    for (let round = 0; round < 50; round += 1) {
      const entries = pool.filter(() => rng() < 0.7).map((tag, index) => entry(tag, Math.floor(rng() * 9) + 1, index));
      const unmastered = entries.filter(() => rng() < 0.8).map((candidate) => candidate.tag);
      const slots = plan(entries, 12, { unmasteredTags: unmastered });
      for (const slot of slots) {
        expect(['reading', 'grammar', 'vocabulary', 'error_review']).toContain(slot.type);
        expect(slot.targetTags.every((tag) => unmastered.includes(tag))).toBe(true);
      }
    }
  });

  it('planning_is_deterministic_for_the_same_input', () => {
    const decorate = (seed: number) =>
      decorateSlots(plan(RICH_LEDGER), {
        genreHistory: [],
        genres: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
        domains: ['travel', 'housing', 'sport', 'science', 'healthcare', 'education', 'law and rights', 'media and news', 'environment', 'personal finance', 'relationships', 'technology ethics', 'culture and the arts', 'food and hospitality', 'workplace negotiation'],
        exemplarCounts: { reading: 3, grammar: 3, vocabulary: 3, error_review: 3 } as Record<GeneratedContentType, number>,
        priorSlotsByType: { reading: 4 },
        rng: seeded(seed),
      });

    expect(decorate(42)).toEqual(decorate(42));
    const slots = decorate(42);
    expect(new Set(slots.map((slot) => slot.topicDomain)).size).toBe(12);
    const readings = slots.filter((slot) => slot.type === 'reading');
    expect(readings.map((slot) => slot.exemplarIndex)).toEqual(readings.map((_, index) => (4 + index) % 3));
    expect(slots.filter((slot) => slot.type === 'grammar').map((slot) => slot.exemplarIndex)).toEqual([0, 1, 2]);
    expect(slots.filter((slot) => slot.type !== 'reading').every((slot) => slot.genre === null)).toBe(true);
  });
});
