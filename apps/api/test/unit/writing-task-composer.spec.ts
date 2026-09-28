import { describe, expect, it } from 'vitest';

import { loadWritingTaskRulesFile } from '../../src/writing/rules/writing-task-rules';
import { composeTask, type ComposeTaskInput } from '../../src/writing/composition/task-composer';
import { WRITING_TASK_RULES_PATH } from '../../src/writing/writing.constants';

const { rules } = loadWritingTaskRulesFile(WRITING_TASK_RULES_PATH);
const labelOf = (tag: string): string => tag.split(':')[1]!.replace(/-/g, ' ');

function baseInput(overrides: Partial<ComposeTaskInput> = {}): ComposeTaskInput {
  return {
    activityId: '11111111-1111-4111-8111-111111111111',
    activityTags: [],
    unmasteredRanked: [],
    recentScenarioIds: [],
    rules,
    labelOf,
    ...overrides,
  };
}

describe('composeTask', () => {
  it('targets_the_activitys_tags_that_are_still_unmastered', () => {
    const composed = composeTask(
      baseInput({
        activityTags: ['grammar:conditional-3', 'discourse:hedging'],
        unmasteredRanked: ['grammar:conditional-3', 'discourse:hedging', 'vocab:idiom'],
      }),
    );
    expect(composed.targetTags.map((t) => t.tag)).toEqual(['grammar:conditional-3', 'discourse:hedging']);
    expect(composed.statement).toContain(rules.requirements['grammar:conditional-3']);
    expect(composed.statement).toContain(rules.requirements['discourse:hedging']);
    const orderInStatement =
      composed.statement.indexOf(rules.requirements['grammar:conditional-3']!) <
      composed.statement.indexOf(rules.requirements['discourse:hedging']!);
    expect(orderInStatement).toBe(true);
  });

  it('drops_a_target_that_is_no_longer_unmastered', () => {
    const composed = composeTask(
      baseInput({
        activityTags: ['grammar:conditional-3', 'discourse:hedging'],
        unmasteredRanked: ['discourse:hedging'],
      }),
    );
    expect(composed.targetTags.map((t) => t.tag)).toEqual(['discourse:hedging']);
  });

  it('substitutes_the_top_ranked_unmastered_tag_when_none_of_the_activitys_remain', () => {
    const composed = composeTask(
      baseInput({
        activityTags: ['grammar:conditional-3'],
        unmasteredRanked: ['vocab:idiom', 'grammar:passive-voice'],
      }),
    );
    expect(composed.targetTags.map((t) => t.tag)).toEqual(['vocab:idiom']);
  });

  it('falls_back_to_the_general_requirement_with_no_unmastered_analysis_tag', () => {
    const composed = composeTask(baseInput({ activityTags: ['grammar:conditional-3'], unmasteredRanked: [] }));
    expect(composed.targetTags).toEqual([]);
    expect(composed.statement).toContain(rules.generalRequirement);
  });

  it('never_targets_a_phoneme_tag', () => {
    // The composer only ever targets a tag present in `unmasteredRanked` (A3); restricting that list to
    // analysis-family tags is the caller's job (`WritingActivityService`), proven at the integration level. Here,
    // a phoneme tag on the activity that never appears in `unmasteredRanked` is simply ignored, like any other
    // tag the caller did not rank as a candidate.
    const composed = composeTask(
      baseInput({ activityTags: ['phoneme:/θ/', 'grammar:conditional-3'], unmasteredRanked: ['grammar:conditional-3'] }),
    );
    expect(composed.targetTags.map((t) => t.tag)).toEqual(['grammar:conditional-3']);
  });

  it('every_tag_and_scenario_composes_within_80_to_150_words', () => {
    for (const scenario of rules.scenarios) {
      for (const tag of Object.keys(rules.requirements)) {
        const composed = composeTask(
          baseInput({ activityId: scenario.id, activityTags: [tag], unmasteredRanked: [tag] }),
        );
        expect(composed.statementWords).toBeGreaterThanOrEqual(80);
        expect(composed.statementWords).toBeLessThanOrEqual(150);
      }
      const general = composeTask(baseInput({ activityId: scenario.id, activityTags: [], unmasteredRanked: [] }));
      expect(general.statementWords).toBeGreaterThanOrEqual(80);
      expect(general.statementWords).toBeLessThanOrEqual(150);
    }
  });

  it('does_not_repeat_a_scenario_within_the_window', () => {
    const recentScenarioIds = rules.scenarios.slice(0, 4).map((s) => s.id);
    for (let i = 0; i < 20; i++) {
      const composed = composeTask(
        baseInput({ activityId: `activity-${i}`, recentScenarioIds }),
      );
      expect(recentScenarioIds).not.toContain(composed.scenarioId);
    }
  });

  it('is_deterministic_for_the_same_lineage', () => {
    const input = baseInput({ activityTags: ['vocab:idiom'], unmasteredRanked: ['vocab:idiom'] });
    const first = composeTask(input);
    const second = composeTask(input);
    expect(second).toEqual(first);

    // A carried-over copy passes the same lineage-first id, so it composes identically.
    const carried = composeTask({ ...input, activityId: input.activityId });
    expect(carried).toEqual(first);
  });
});
