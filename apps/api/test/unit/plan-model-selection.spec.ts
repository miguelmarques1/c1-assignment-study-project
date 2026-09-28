import type { ContentItemCandidate } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import { validateSelection, type ModelOutput } from '../../src/plans/composition/model-selection';
import type { OfferEntry, RankingContext } from '../../src/plans/composition/candidate-ranking';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

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

function offer(count: number): OfferEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    alias: `c${String(index + 1).padStart(2, '0')}`,
    candidate: candidate(),
    isNewGenerated: false,
  }));
}

function ctx(): RankingContext {
  return {
    unmasteredTags: new Set(['grammar:conditional-3']),
    tagPriority: new Map(),
    cefrLevels: rules.candidates.cefrLevels,
    generalMode: false,
  };
}

const GOOD_RATIONALE = 'Chosen because this targets a recent weak spot.';

describe('validateSelection', () => {
  it('accepts_every_valid_ref', () => {
    const entries = offer(3);
    const output: ModelOutput = { selections: entries.map((e) => ({ ref: e.alias, rationale: GOOD_RATIONALE })) };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.discard).toBe(false);
    expect(result.accepted).toHaveLength(3);
    expect(result.stats.rejected).toEqual({ unknown: 0, duplicate: 0, offTarget: 0 });
  });

  it('rejects_an_unknown_ref', () => {
    const entries = offer(2);
    const output: ModelOutput = { selections: [{ ref: 'c99', rationale: GOOD_RATIONALE }, { ref: entries[0]!.alias, rationale: GOOD_RATIONALE }] };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.stats.rejected.unknown).toBe(1);
    expect(result.accepted).toHaveLength(1);
  });

  it('rejects_a_duplicate_ref', () => {
    const entries = offer(1);
    const output: ModelOutput = { selections: [{ ref: entries[0]!.alias, rationale: GOOD_RATIONALE }, { ref: entries[0]!.alias, rationale: GOOD_RATIONALE }] };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.stats.rejected.duplicate).toBe(1);
    expect(result.accepted).toHaveLength(1);
  });

  it('ignores_entries_beyond_the_configured_maximum', () => {
    const entries = offer(rules.model.selections.max + 5);
    const output: ModelOutput = { selections: entries.map((e) => ({ ref: e.alias, rationale: GOOD_RATIONALE })) };
    const result = validateSelection(output, entries, ctx(), rules);
    // `returned` reports what the model sent (curator visibility); only the first `max` are considered.
    expect(result.stats.returned).toBe(entries.length);
    expect(result.accepted).toHaveLength(rules.model.selections.max);
  });

  it('discards_everything_when_more_than_half_is_invalid', () => {
    const entries = offer(2);
    const output: ModelOutput = {
      selections: [
        { ref: entries[0]!.alias, rationale: GOOD_RATIONALE },
        { ref: 'unknown-1', rationale: GOOD_RATIONALE },
        { ref: 'unknown-2', rationale: GOOD_RATIONALE },
      ],
    };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.discard).toBe(true);
    expect(result.accepted).toHaveLength(0);
    expect(result.stats.accepted).toBe(0);
  });

  it('keeps_exactly_half_invalid_without_discarding', () => {
    const entries = offer(2);
    const output: ModelOutput = {
      selections: [
        { ref: entries[0]!.alias, rationale: GOOD_RATIONALE },
        { ref: 'unknown', rationale: GOOD_RATIONALE },
      ],
    };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.discard).toBe(false);
    expect(result.accepted).toHaveLength(1);
  });

  it('drops_an_overlong_rationale_to_null_for_the_template_fallback', () => {
    const entries = offer(1);
    const output: ModelOutput = { selections: [{ ref: entries[0]!.alias, rationale: 'x'.repeat(300) }] };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.accepted[0]!.rationale).toBeNull();
  });

  it('keeps_a_valid_one_line_rationale', () => {
    const entries = offer(1);
    const output: ModelOutput = { selections: [{ ref: entries[0]!.alias, rationale: GOOD_RATIONALE }] };
    const result = validateSelection(output, entries, ctx(), rules);
    expect(result.accepted[0]!.rationale).toBe(GOOD_RATIONALE);
  });
});
