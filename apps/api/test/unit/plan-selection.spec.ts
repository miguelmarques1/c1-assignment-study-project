import type { ContentItemCandidate } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import type { RankingContext } from '../../src/plans/composition/candidate-ranking';
import { rankCandidates } from '../../src/plans/composition/candidate-ranking';
import { selectPlan, type PlanSelectionInputs } from '../../src/plans/composition/plan-selection';
import type { RationaleContext } from '../../src/plans/composition/rationale';
import type { RankedPlanTag } from '../../src/plans/composition/tag-priority';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);
const rationaleCtx: RationaleContext = { labelOf: (tag) => tag.split(':')[1] ?? tag };

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
  return { tag: 'grammar:conditional-3', family: 'grammar', source: 'unmastered', rank: 1, sightings: null, ...overrides };
}

function inputs(overrides: Partial<PlanSelectionInputs> = {}): PlanSelectionInputs {
  const ctx: RankingContext = {
    unmasteredTags: new Set(['grammar:conditional-3']),
    tagPriority: new Map([['grammar:conditional-3', tag()]]),
    cefrLevels: rules.candidates.cefrLevels,
    generalMode: false,
  };
  return { rankedPool: [], ctx, rules, rationaleCtx, ...overrides };
}

describe('selectPlan', () => {
  it('includes_a_listening_and_a_reading_activity_when_the_pool_has_one', () => {
    const listening = candidate({ type: 'listening', durationSeconds: 300 });
    const reading = candidate({ type: 'reading' });
    const grammar = candidate({ type: 'grammar' });
    const pool = rankCandidates([listening, reading, grammar], new Set(), inputs().ctx);
    const result = selectPlan(inputs({ rankedPool: pool }), null);
    const all = [...result.activities, ...result.quotaPinned];

    expect(all.some((a) => a.kind === 'listening')).toBe(true);
    expect(all.some((a) => a.kind === 'reading')).toBe(true);
    expect(result.notes).not.toContain('missing_listening');
    expect(result.notes).not.toContain('missing_reading');
  });

  it('pins_a_listening_item_the_deterministic_interleave_excluded_through_the_per_tag_cap', () => {
    // Three grammar items on the same tag exhaust the per-tag cap before the
    // interleave's listening cursor gets a second look; the single listening
    // candidate on that same tag is skipped there and picked up as a pin.
    const sameTag = ['grammar:conditional-3'];
    const grammarItems = Array.from({ length: 4 }, () => candidate({ type: 'grammar', targetTags: sameTag }));
    const listening = candidate({ type: 'listening', targetTags: sameTag, durationSeconds: 300 });
    const pool = rankCandidates([...grammarItems, listening], new Set(), inputs().ctx);
    const result = selectPlan(inputs({ rankedPool: pool, rules: { ...rules, candidates: { ...rules.candidates, maxPerPrimaryTag: 1 } } }), null);

    expect(result.activities.filter((a) => a.kind === 'grammar')).toHaveLength(1);
    expect(result.activities.some((a) => a.kind === 'listening')).toBe(false);
    expect(result.quotaPinned.some((a) => a.kind === 'listening')).toBe(true);
  });

  it('adds_a_missing_type_note_when_the_bank_has_no_eligible_listening', () => {
    const reading = candidate({ type: 'reading' });
    const pool = rankCandidates([reading], new Set(), inputs().ctx);
    const result = selectPlan(inputs({ rankedPool: pool }), null);
    expect(result.notes).toContain('missing_listening');
  });

  it('writing_tasks_target_distinct_analysis_tags', () => {
    const ctx: RankingContext = {
      unmasteredTags: new Set(['grammar:a', 'vocab:b']),
      tagPriority: new Map([
        ['grammar:a', tag({ tag: 'grammar:a', family: 'grammar', rank: 1 })],
        ['vocab:b', tag({ tag: 'vocab:b', family: 'vocab', rank: 2 })],
      ]),
      cefrLevels: rules.candidates.cefrLevels,
      generalMode: false,
    };
    const result = selectPlan(inputs({ ctx, rankedPool: [] }), null);
    const writingTasks = result.tasks.filter((t) => t.kind === 'writing');
    expect(writingTasks).toHaveLength(2);
    expect(writingTasks[0]!.targetTags).toEqual(['grammar:a']);
    expect(writingTasks[1]!.targetTags).toEqual(['vocab:b']);
  });

  it('pronunciation_tasks_target_phoneme_tags_when_present', () => {
    const ctx: RankingContext = {
      unmasteredTags: new Set(['phoneme:/th/']),
      tagPriority: new Map([['phoneme:/th/', tag({ tag: 'phoneme:/th/', family: 'phoneme' })]]),
      cefrLevels: rules.candidates.cefrLevels,
      generalMode: false,
    };
    const result = selectPlan(inputs({ ctx, rankedPool: [] }), null);
    const pronunciationTasks = result.tasks.filter((t) => t.kind === 'pronunciation');
    expect(pronunciationTasks.length).toBe(rules.tasks.pronunciation.count);
    expect(pronunciationTasks.every((t) => t.targetTags.includes('phoneme:/th/'))).toBe(true);
    const speakingTasks = result.tasks.filter((t) => t.kind === 'speaking');
    expect(speakingTasks.length).toBe(rules.tasks.speaking.count);
  });

  it('speaking_replaces_pronunciation_when_no_phoneme_tag_is_unmastered', () => {
    const result = selectPlan(inputs(), null);
    expect(result.tasks.filter((t) => t.kind === 'pronunciation')).toHaveLength(0);
    expect(result.tasks.filter((t) => t.kind === 'speaking')).toHaveLength(rules.tasks.speakingWithoutPronunciation.count);
  });

  it('general_mode_skips_the_tag_guardrail_and_notes_general_material', () => {
    const c1 = candidate({ cefrLevel: 'C1', targetTags: [] });
    const ctx: RankingContext = {
      unmasteredTags: new Set(),
      tagPriority: new Map(),
      cefrLevels: rules.candidates.cefrLevels,
      generalMode: true,
    };
    const pool = rankCandidates([c1], new Set(), ctx);
    const result = selectPlan(inputs({ ctx, rankedPool: pool }), null);
    expect(result.notes).toContain('general_material');
    expect(result.activities.length + result.quotaPinned.length).toBeGreaterThan(0);
    expect(result.tasks.every((t) => t.targetTags.length === 0)).toBe(true);
  });

  it('due_tags_mark_their_activity_as_review', () => {
    const due = candidate({ type: 'grammar', targetTags: ['grammar:conditional-3'] });
    const ctx: RankingContext = {
      unmasteredTags: new Set(['grammar:conditional-3']),
      tagPriority: new Map([['grammar:conditional-3', tag({ source: 'due' })]]),
      cefrLevels: rules.candidates.cefrLevels,
      generalMode: false,
    };
    const pool = rankCandidates([due], new Set(), ctx);
    const result = selectPlan(inputs({ ctx, rankedPool: pool }), null);
    expect(result.activities.find((a) => a.contentItemId === due.id)?.isReview).toBe(true);
  });

  it('error_review_items_are_always_marked_review', () => {
    const item = candidate({ type: 'error_review' });
    const pool = rankCandidates([item], new Set(), inputs().ctx);
    const result = selectPlan(inputs({ rankedPool: pool }), null);
    expect(result.activities.find((a) => a.contentItemId === item.id)?.isReview).toBe(true);
  });
});
