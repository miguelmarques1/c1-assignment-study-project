import type { PlanActivityKind } from '@english-quest/shared';

import { estimateMinutes } from './composition/estimates';
import type { OfferEntry } from './composition/candidate-ranking';
import type { PlanTagSource, RankedPlanTag } from './composition/tag-priority';
import type { StudyPlanRules } from './rules/plan-rules';

export interface ComposePromptVariables extends Record<string, string> {
  profile_summary: string;
  focus_tags: string;
  review_tags: string;
  candidates: string;
  selection_range: string;
}

function sourceText(source: PlanTagSource): string {
  if (source === 'due') {
    return 'due for review';
  }
  return source === 'recurring' ? 'recurring' : 'unmastered';
}

function offerLine(entry: OfferEntry, rules: StudyPlanRules): string {
  const candidate = entry.candidate;
  const minutes = estimateMinutes(
    candidate.type as PlanActivityKind,
    { durationSeconds: candidate.durationSeconds, wordCount: candidate.wordCount },
    rules,
  );
  const note = entry.isNewGenerated ? 'new for this plan' : '';
  return `${entry.alias} | ${candidate.type} | ${candidate.cefrLevel} | ${candidate.topic} | ${candidate.skills.join(', ')} | ${candidate.targetTags.join(', ')} | ${minutes} min | ${note}`;
}

export interface ComposePromptInput {
  /** F12's compact summary for this user, already capped at 1,500 estimated tokens. */
  profileSummary: string;
  tagPriority: ReadonlyMap<string, RankedPlanTag>;
  labelOf: (tag: string) => string;
  offer: readonly OfferEntry[];
  rules: StudyPlanRules;
}

/**
 * Renders `study-plan-compose`'s variables from already-fetched data: the
 * owner's own compact summary, their tag priorities and labels, and the
 * aliased candidate offer — never a full item body, an answer key, or
 * another participant's data (spec §5). Pure.
 */
export function buildComposePromptVariables(input: ComposePromptInput): ComposePromptVariables {
  const ranked = [...input.tagPriority.values()].sort((a, b) => a.rank - b.rank).slice(0, 15);
  const focusLines = ranked
    .map((tag) => `- ${tag.tag} (${input.labelOf(tag.tag)}): ${sourceText(tag.source)}`)
    .join('\n');
  const dueTags = ranked.filter((tag) => tag.source === 'due');
  const reviewLines = dueTags.map((tag) => `- ${tag.tag} (${input.labelOf(tag.tag)})`).join('\n');

  return {
    profile_summary: input.profileSummary,
    focus_tags: focusLines.length > 0 ? focusLines : 'None recorded yet.',
    review_tags: reviewLines.length > 0 ? reviewLines : 'None due.',
    candidates: input.offer.map((entry) => offerLine(entry, input.rules)).join('\n'),
    selection_range: `between ${input.rules.model.selections.min} and ${input.rules.model.selections.max}`,
  };
}
