import type { ContentItemCandidate, ContentItemType, PlanActivityKind, PlanNoteCode } from '@english-quest/shared';

import type { StudyPlanRules } from '../rules/plan-rules';
import { primaryTagOf, type RankingContext } from './candidate-ranking';
import { estimateMinutes } from './estimates';
import type { ValidatedSelection } from './model-selection';
import {
  pronunciationTaskRationale,
  speakingTaskRationale,
  templateRationale,
  writingTaskRationale,
  type RationaleContext,
} from './rationale';
import type { RankedPlanTag } from './tag-priority';

export type ActivityPlacement = 'model' | 'guardrail' | 'task';

export interface SelectedActivity {
  kind: PlanActivityKind;
  /** Null for the three task kinds. */
  contentItemId: string | null;
  title: string;
  targetTags: string[];
  estimatedMinutes: number;
  rationale: string;
  isReview: boolean;
  placement: ActivityPlacement;
  /** Task kinds only: the day the rules file assigns this occurrence, before the packer tries to honour it. */
  preferredDay: number | null;
}

export interface ComposedSelection {
  /** Added only when the ranked bank list has none of that type (spec A11: placed on the emptiest session). */
  quotaPinned: SelectedActivity[];
  /** The model's accepted order first, then the deterministic interleave — deduplicated, quota-pinned items excluded. */
  activities: SelectedActivity[];
  tasks: SelectedActivity[];
  notes: PlanNoteCode[];
}

const KIND_ORDER: readonly ContentItemType[] = ['reading', 'grammar', 'vocabulary', 'listening', 'error_review'];

function toSelectedActivity(
  candidate: ContentItemCandidate,
  ctx: RankingContext,
  rules: StudyPlanRules,
  rationaleCtx: RationaleContext,
  placement: 'model' | 'guardrail',
  modelRationale: string | null,
): SelectedActivity {
  const primary = primaryTagOf(candidate, ctx);
  const kind = candidate.type as PlanActivityKind;
  return {
    kind,
    contentItemId: candidate.id,
    title: candidate.title,
    targetTags: [...candidate.targetTags],
    estimatedMinutes: estimateMinutes(kind, { durationSeconds: candidate.durationSeconds, wordCount: candidate.wordCount }, rules),
    rationale: modelRationale ?? templateRationale(primary, rationaleCtx),
    isReview: kind === 'error_review' || primary?.source === 'due',
    placement,
    preferredDay: null,
  };
}

/**
 * The remaining eligible items, interleaved by kind in a fixed order, each
 * kind in its own ranking order, with at most `maxPerPrimaryTag` bank
 * activities sharing the same primary tag (spec §5 step 7). Pure.
 */
function interleaveByKind(pool: readonly ContentItemCandidate[], ctx: RankingContext, maxPerPrimaryTag: number): ContentItemCandidate[] {
  const byKind = new Map(KIND_ORDER.map((kind) => [kind, pool.filter((candidate) => candidate.type === kind)]));
  const cursors = new Map(KIND_ORDER.map((kind) => [kind, 0]));
  const tagCounts = new Map<string, number>();
  const result: ContentItemCandidate[] = [];

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const kind of KIND_ORDER) {
      const list = byKind.get(kind)!;
      let cursor = cursors.get(kind)!;
      while (cursor < list.length) {
        const candidate = list[cursor]!;
        cursor += 1;
        const primary = primaryTagOf(candidate, ctx);
        const count = primary ? (tagCounts.get(primary.tag) ?? 0) : 0;
        if (primary && count >= maxPerPrimaryTag) {
          continue;
        }
        result.push(candidate);
        if (primary) {
          tagCounts.set(primary.tag, count + 1);
        }
        progressed = true;
        break;
      }
      cursors.set(kind, cursor);
    }
  }
  return result;
}

/**
 * Fills `count` tag sets round-robin, one tag per task per round, up to
 * `range.max` each, preferring a tag no earlier task already took (spec
 * A9: "the two writing tasks take distinct tags"). Only the first round
 * reuses a tag when the pool is smaller than `count` — a later round adds
 * more only while genuinely unused tags remain, never duplicating one
 * task's tag into another just to reach `max`.
 */
function pickDistinctTagSets(
  pool: readonly RankedPlanTag[],
  count: number,
  range: { min: number; max: number },
): RankedPlanTag[][] {
  const sets: RankedPlanTag[][] = Array.from({ length: count }, () => []);
  if (pool.length === 0 || count === 0) {
    return sets;
  }
  const used = new Set<string>();
  for (let round = 0; round < range.max; round += 1) {
    for (const set of sets) {
      const fresh = pool.find((tag) => !used.has(tag.tag));
      if (fresh) {
        set.push(fresh);
        used.add(fresh.tag);
      } else if (round === 0 && set.length === 0) {
        set.push(pool[0]!);
      }
    }
  }
  return sets;
}

/** Discourse tags first, then vocabulary, then the rest — each group in its own priority order (spec A9). */
function speakingPreferenceOrder(analysisTags: readonly RankedPlanTag[]): RankedPlanTag[] {
  const discourse = analysisTags.filter((tag) => tag.family === 'discourse');
  const vocabulary = analysisTags.filter((tag) => tag.family === 'vocab');
  const rest = analysisTags.filter((tag) => tag.family !== 'discourse' && tag.family !== 'vocab');
  return [...discourse, ...vocabulary, ...rest];
}

function taskActivity(
  kind: 'writing' | 'pronunciation' | 'speaking',
  tags: readonly RankedPlanTag[],
  title: string,
  rationale: string,
  day: number,
  rules: StudyPlanRules,
): SelectedActivity {
  return {
    kind,
    contentItemId: null,
    title,
    targetTags: tags.map((tag) => tag.tag),
    estimatedMinutes: estimateMinutes(kind, { durationSeconds: null, wordCount: null }, rules),
    rationale,
    isReview: false,
    placement: 'task',
    preferredDay: day,
  };
}

function buildTasks(
  tagPriority: ReadonlyMap<string, RankedPlanTag>,
  generalMode: boolean,
  rules: StudyPlanRules,
  rationaleCtx: RationaleContext,
): SelectedActivity[] {
  const all = [...tagPriority.values()];
  const phonemeTags = all.filter((tag) => tag.family === 'phoneme');
  const analysisTags = all.filter((tag) => tag.family !== 'phoneme');
  const tasks: SelectedActivity[] = [];

  const writingRules = rules.tasks.writing;
  const writingTagSets = generalMode ? [] : pickDistinctTagSets(analysisTags, writingRules.count, writingRules.tags);
  writingRules.days.forEach((day, index) => {
    const tags = writingTagSets[index] ?? [];
    const primary = tags[0] ?? null;
    const title = primary ? `Writing: ${rationaleCtx.labelOf(primary.tag)}` : 'Writing task';
    tasks.push(taskActivity('writing', tags, title, writingTaskRationale(primary, rationaleCtx), day, rules));
  });

  const usePronunciation = !generalMode && phonemeTags.length > 0;
  if (usePronunciation) {
    const pronunciationRules = rules.tasks.pronunciation;
    const pronunciationTagSets = pickDistinctTagSets(phonemeTags, pronunciationRules.count, pronunciationRules.tags);
    pronunciationRules.days.forEach((day, index) => {
      const tags = pronunciationTagSets[index] ?? [];
      const title = tags.length > 0 ? `Read aloud: ${tags.map((tag) => rationaleCtx.labelOf(tag.tag)).join(', ')}` : 'Read aloud';
      tasks.push(taskActivity('pronunciation', tags, title, pronunciationTaskRationale(tags, rationaleCtx), day, rules));
    });

    const speakingPool = speakingPreferenceOrder(analysisTags);
    const speakingRules = rules.tasks.speaking;
    const speakingTagSets = pickDistinctTagSets(speakingPool, speakingRules.count, speakingRules.tags);
    speakingRules.days.forEach((day, index) => {
      const tags = speakingTagSets[index] ?? [];
      const title = tags[0] ? `Speaking: ${rationaleCtx.labelOf(tags[0].tag)}` : 'Speaking task';
      tasks.push(taskActivity('speaking', tags, title, speakingTaskRationale(tags, rationaleCtx), day, rules));
    });
  } else {
    const speakingPool = generalMode ? [] : speakingPreferenceOrder(analysisTags);
    const speakingWithoutPronunciation = rules.tasks.speakingWithoutPronunciation;
    const speakingTagSets = pickDistinctTagSets(speakingPool, speakingWithoutPronunciation.count, rules.tasks.speaking.tags);
    speakingWithoutPronunciation.days.forEach((day, index) => {
      const tags = speakingTagSets[index] ?? [];
      const title = tags[0] ? `Speaking: ${rationaleCtx.labelOf(tags[0].tag)}` : 'Speaking task';
      tasks.push(taskActivity('speaking', tags, title, speakingTaskRationale(tags, rationaleCtx), day, rules));
    });
  }

  return tasks;
}

export interface PlanSelectionInputs {
  /** Eligible, already ranked by `rankCandidates` (generation items first). */
  rankedPool: readonly ContentItemCandidate[];
  ctx: RankingContext;
  rules: StudyPlanRules;
  rationaleCtx: RationaleContext;
}

/**
 * Composes the plan's non-carried content: the model's accepted picks (if
 * any) followed by the deterministic interleave, the listening/reading
 * quota pins, the writing/pronunciation/speaking task slots, and the
 * notes a missing quota or general mode produces (spec §5 "The composition
 * algorithm", A9, A11, A12, A15, A27). Pure.
 */
export function selectPlan(inputs: PlanSelectionInputs, validated: ValidatedSelection | null): ComposedSelection {
  const { rankedPool, ctx, rules, rationaleCtx } = inputs;
  const notes: PlanNoteCode[] = [];
  const chosenIds = new Set<string>();
  const activities: SelectedActivity[] = [];

  if (validated && !validated.discard) {
    for (const selection of validated.accepted) {
      activities.push(toSelectedActivity(selection.candidate, ctx, rules, rationaleCtx, 'model', selection.rationale));
      chosenIds.add(selection.candidate.id);
    }
  }

  const tail = interleaveByKind(
    rankedPool.filter((candidate) => !chosenIds.has(candidate.id)),
    ctx,
    rules.candidates.maxPerPrimaryTag,
  );
  for (const candidate of tail) {
    activities.push(toSelectedActivity(candidate, ctx, rules, rationaleCtx, 'guardrail', null));
    chosenIds.add(candidate.id);
  }

  const quotaPinned: SelectedActivity[] = [];
  for (const type of ['listening', 'reading'] as const) {
    if (activities.some((activity) => activity.kind === type)) {
      continue;
    }
    const best = rankedPool.find((candidate) => candidate.type === type && !chosenIds.has(candidate.id));
    if (best) {
      quotaPinned.push(toSelectedActivity(best, ctx, rules, rationaleCtx, 'guardrail', null));
      chosenIds.add(best.id);
    } else {
      notes.push(type === 'listening' ? 'missing_listening' : 'missing_reading');
    }
  }

  const tasks = buildTasks(ctx.tagPriority, ctx.generalMode, rules, rationaleCtx);

  if (ctx.generalMode) {
    notes.push('general_material');
  }

  return { quotaPinned, activities, tasks, notes };
}
