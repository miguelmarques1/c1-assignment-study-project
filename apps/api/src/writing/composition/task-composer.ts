import { createHash } from 'node:crypto';

import { countWords, type PlanTag } from '@english-quest/shared';

import type { WritingTaskRules } from '../rules/writing-task-rules';

export interface ComposeTaskInput {
  /** The activity's own carry-over lineage, oldest first — index 0 is what the scenario hash is taken over (A3, A4). */
  activityId: string;
  /** The activity's own `targetTags`, in order. */
  activityTags: readonly string[];
  /** The owner's unmastered analysis-family tags, already ranked: `recurringFor` order first, then most recently seen (A3). */
  unmasteredRanked: readonly string[];
  /** The scenario ids of the owner's last `scenario_no_repeat_within` tasks, most recent first. */
  recentScenarioIds: readonly string[];
  rules: WritingTaskRules;
  labelOf: (tag: string) => string;
}

export interface ComposedTask {
  heading: string;
  statement: string;
  statementWords: number;
  targetTags: PlanTag[];
  scenarioId: string;
}

/** The first 8 hex digits of sha256(activityId), as an unsigned integer — stable across a retried open, a second device or a carried copy (A3). */
function scenarioHash(activityId: string): number {
  return parseInt(createHash('sha256').update(activityId).digest('hex').slice(0, 8), 16);
}

/**
 * Which analysis tags this task targets (A3). Restricted to the activity's
 * own tags first, falling back to the owner's top-ranked unmastered tag, and
 * finally to a general task with no target.
 */
function selectTargets(input: ComposeTaskInput): string[] {
  const unmasteredSet = new Set(input.unmasteredRanked);
  const fromActivity = input.activityTags.filter((tag) => unmasteredSet.has(tag)).slice(0, input.rules.tagsPerTaskMax);
  if (fromActivity.length > 0) {
    return fromActivity;
  }
  if (input.unmasteredRanked.length > 0) {
    return [input.unmasteredRanked[0]!];
  }
  return [];
}

/** From the scenarios not used by the owner's recent tasks, the one at `hash mod count` (A3). */
function selectScenario(input: ComposeTaskInput): WritingTaskRules['scenarios'][number] {
  const recent = new Set(input.recentScenarioIds);
  const candidates = input.rules.scenarios.filter((scenario) => !recent.has(scenario.id));
  const pool = candidates.length > 0 ? candidates : input.rules.scenarios;
  const index = scenarioHash(input.activityId) % pool.length;
  return pool[index]!;
}

/**
 * Composes a writing task from a versioned rules file and the owner's own
 * ranked weaknesses (A2, A3). Pure and deterministic: the same lineage's
 * first activity id, the same candidate tags and the same rules always
 * produce the identical task, whichever device or retried request composed
 * it (A4).
 */
export function composeTask(input: ComposeTaskInput): ComposedTask {
  const targets = selectTargets(input);
  const scenario = selectScenario(input);

  const requirementSentences =
    targets.length > 0
      ? targets.map((tag) => input.rules.requirements[tag]!)
      : [input.rules.generalRequirement];
  const secondParagraph = [...requirementSentences, input.rules.closing].join(' ');
  const statement = `${scenario.text}\n\n${secondParagraph}`;

  return {
    heading: scenario.heading,
    statement,
    statementWords: countWords(statement),
    targetTags: targets.map((tag) => ({ tag, label: input.labelOf(tag) })),
    scenarioId: scenario.id,
  };
}
