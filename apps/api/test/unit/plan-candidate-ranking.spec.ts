import type { ContentItemCandidate } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import {
  buildOffer,
  isEligible,
  primaryTagOf,
  rankCandidates,
  type RankingContext,
} from '../../src/plans/composition/candidate-ranking';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';
import type { RankedPlanTag } from '../../src/plans/composition/tag-priority';

const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

let nextId = 1;
function candidate(overrides: Partial<ContentItemCandidate> = {}): ContentItemCandidate {
  const id = `id-${nextId++}`;
  return {
    id,
    slug: id,
    type: 'reading',
    provenance: 'curated',
    cefrLevel: 'C1',
    title: `Item ${id}`,
    topic: 'housing',
    accent: null,
    durationSeconds: null,
    wordCount: 500,
    skills: ['reading'],
    difficulty: 4,
    targetTags: ['grammar:conditional-3'],
    ...overrides,
  };
}

function tag(overrides: Partial<RankedPlanTag> = {}): RankedPlanTag {
  return { tag: 'grammar:conditional-3', family: 'grammar', source: 'unmastered', rank: 5, sightings: null, ...overrides };
}

function ctx(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    unmasteredTags: new Set(['grammar:conditional-3']),
    tagPriority: new Map([['grammar:conditional-3', tag()]]),
    cefrLevels: rules.candidates.cefrLevels,
    generalMode: false,
    ...overrides,
  };
}

describe('isEligible', () => {
  it('requires_the_cefr_level_to_be_allowed', () => {
    const item = candidate({ cefrLevel: 'A2' });
    expect(isEligible(item, ctx())).toBe(false);
  });

  it('requires_an_intersecting_unmastered_tag_outside_general_mode', () => {
    const off = candidate({ targetTags: ['grammar:passive-voice'] });
    expect(isEligible(off, ctx())).toBe(false);
    const on = candidate({ targetTags: ['grammar:conditional-3'] });
    expect(isEligible(on, ctx())).toBe(true);
  });

  it('general_mode_only_checks_the_level', () => {
    const item = candidate({ targetTags: ['grammar:whatever-else'], cefrLevel: 'C2' });
    expect(isEligible(item, ctx({ generalMode: true, unmasteredTags: new Set() }))).toBe(true);
  });
});

describe('primaryTagOf', () => {
  it('picks_the_best_tier_then_best_rank', () => {
    const due = tag({ tag: 'a', source: 'due', rank: 9 });
    const unmastered = tag({ tag: 'b', source: 'unmastered', rank: 1 });
    const item = candidate({ targetTags: ['a', 'b'] });
    const result = primaryTagOf(item, ctx({ unmasteredTags: new Set(['a', 'b']), tagPriority: new Map([['a', due], ['b', unmastered]]) }));
    expect(result?.tag).toBe('a');
  });

  it('is_always_null_in_general_mode', () => {
    const item = candidate();
    expect(primaryTagOf(item, ctx({ generalMode: true }))).toBeNull();
  });
});

describe('rankCandidates', () => {
  it('filters_out_ineligible_candidates', () => {
    const eligible = candidate({ targetTags: ['grammar:conditional-3'] });
    const ineligible = candidate({ targetTags: ['grammar:passive-voice'] });
    const ranked = rankCandidates([eligible, ineligible], new Set(), ctx());
    expect(ranked.map((c) => c.id)).toEqual([eligible.id]);
  });

  it('a_new_generation_item_always_sorts_first', () => {
    const generated = candidate({ targetTags: ['grammar:conditional-3'] });
    const other = candidate({ targetTags: ['grammar:conditional-3'] });
    const ranked = rankCandidates([other, generated], new Set([generated.id]), ctx());
    expect(ranked[0]!.id).toBe(generated.id);
  });

  it('lower_tier_and_rank_sorts_before_higher', () => {
    const dueTag = tag({ tag: 'due-tag', source: 'due', rank: 3 });
    const unmasteredTag = tag({ tag: 'other-tag', source: 'unmastered', rank: 1 });
    const dueItem = candidate({ targetTags: ['due-tag'] });
    const unmasteredItem = candidate({ targetTags: ['other-tag'] });
    const context = ctx({
      unmasteredTags: new Set(['due-tag', 'other-tag']),
      tagPriority: new Map([['due-tag', dueTag], ['other-tag', unmasteredTag]]),
    });
    const ranked = rankCandidates([unmasteredItem, dueItem], new Set(), context);
    expect(ranked[0]!.id).toBe(dueItem.id);
  });

  it('cefr_preference_and_difficulty_distance_break_remaining_ties', () => {
    const c1 = candidate({ cefrLevel: 'C1', difficulty: 4 });
    const c2 = candidate({ cefrLevel: 'C2', difficulty: 4 });
    const ranked = rankCandidates([c2, c1], new Set(), ctx());
    expect(ranked[0]!.id).toBe(c1.id);
  });

  it('general_mode_ignores_tag_tiers_and_only_uses_cefr_and_difficulty', () => {
    const near = candidate({ cefrLevel: 'C1', difficulty: 4, targetTags: [] });
    const far = candidate({ cefrLevel: 'C1', difficulty: 1, targetTags: [] });
    const ranked = rankCandidates([far, near], new Set(), ctx({ generalMode: true, unmasteredTags: new Set() }));
    expect(ranked[0]!.id).toBe(near.id);
  });
});

describe('buildOffer', () => {
  it('includes_every_generation_run_item_first', () => {
    const generated = candidate({ targetTags: ['grammar:conditional-3'] });
    const bank = candidate({ targetTags: ['grammar:conditional-3'] });
    const ranked = rankCandidates([bank, generated], new Set([generated.id]), ctx());
    const offer = buildOffer(ranked, new Set([generated.id]), rules);
    expect(offer[0]!.candidate.id).toBe(generated.id);
    expect(offer[0]!.isNewGenerated).toBe(true);
  });

  it('caps_offered_items_per_type', () => {
    const items = Array.from({ length: 10 }, () => candidate({ type: 'reading', targetTags: ['grammar:conditional-3'] }));
    const ranked = rankCandidates(items, new Set(), ctx());
    const offer = buildOffer(ranked, new Set(), rules);
    expect(offer.length).toBe(rules.candidates.offeredPerType.reading);
  });

  it('never_exceeds_the_offered_max', () => {
    const items = [
      ...Array.from({ length: 6 }, () => candidate({ type: 'reading', targetTags: ['grammar:conditional-3'] })),
      ...Array.from({ length: 6 }, () => candidate({ type: 'listening', targetTags: ['grammar:conditional-3'] })),
      ...Array.from({ length: 6 }, () => candidate({ type: 'vocabulary', targetTags: ['grammar:conditional-3'] })),
      ...Array.from({ length: 6 }, () => candidate({ type: 'grammar', targetTags: ['grammar:conditional-3'] })),
      ...Array.from({ length: 6 }, () => candidate({ type: 'error_review', targetTags: ['grammar:conditional-3'] })),
    ];
    const ranked = rankCandidates(items, new Set(), ctx());
    const offer = buildOffer(ranked, new Set(), rules);
    expect(offer.length).toBeLessThanOrEqual(rules.candidates.offeredMax);
  });

  it('assigns_sequential_aliases', () => {
    const items = [candidate({ targetTags: ['grammar:conditional-3'] }), candidate({ targetTags: ['grammar:conditional-3'] })];
    const ranked = rankCandidates(items, new Set(), ctx());
    const offer = buildOffer(ranked, new Set(), rules);
    expect(offer.map((entry) => entry.alias)).toEqual(['c01', 'c02']);
  });
});
