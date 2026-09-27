import type { StudyPlanRules } from '../rules/plan-rules';
import type { RankedPlanTag } from './tag-priority';

const GENERAL_RATIONALE = 'General C1 practice while your profile builds up.';

export interface RationaleContext {
  labelOf: (tag: string) => string;
}

/**
 * Keeps the model's own rationale only when it is exactly one line within
 * the rules' character range; otherwise returns null so the caller falls
 * back to a template (spec A14).
 */
export function acceptModelRationale(text: string, rules: StudyPlanRules): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.includes('\n')) {
    return null;
  }
  if (trimmed.length < rules.model.rationaleChars.min || trimmed.length > rules.model.rationaleChars.max) {
    return null;
  }
  return trimmed;
}

/** A bank activity's rationale, keyed on its primary tag and that tag's evidence (spec §5 "Rationale templates"). */
export function templateRationale(primaryTag: RankedPlanTag | null, ctx: RationaleContext): string {
  if (!primaryTag) {
    return GENERAL_RATIONALE;
  }
  const label = ctx.labelOf(primaryTag.tag);
  if (primaryTag.source === 'due') {
    return `Due for review: ${label} is back on your schedule.`;
  }
  const sightings = primaryTag.sightings;
  if (sightings) {
    if (sightings.lessons >= 2) {
      return `Chosen because ${label} appeared in ${sightings.lessons} of your last ${sightings.of} lessons.`;
    }
    if (sightings.lessons === 1 && sightings.inLatest) {
      return `Chosen because ${label} came up in your last lesson.`;
    }
    if (sightings.lessons === 1) {
      return `Chosen because ${label} came up in one of your last ${sightings.of} lessons.`;
    }
  }
  return `Chosen because ${label} is still on your error list.`;
}

export function writingTaskRationale(tag: RankedPlanTag | null, ctx: RationaleContext): string {
  if (!tag) {
    return GENERAL_RATIONALE;
  }
  const label = ctx.labelOf(tag.tag);
  if (tag.sightings && tag.sightings.lessons >= 1) {
    return `Writing practice built around ${label}, which appeared in ${tag.sightings.lessons} of your last ${tag.sightings.of} lessons.`;
  }
  return `Writing practice built around ${label}.`;
}

export function pronunciationTaskRationale(tags: readonly RankedPlanTag[], ctx: RationaleContext): string {
  if (tags.length === 0) {
    return GENERAL_RATIONALE;
  }
  return `Read-aloud practice for ${tags.map((tag) => ctx.labelOf(tag.tag)).join(', ')}, sounds you missed in recent lessons.`;
}

export function speakingTaskRationale(tags: readonly RankedPlanTag[], ctx: RationaleContext): string {
  if (tags.length === 0) {
    return GENERAL_RATIONALE;
  }
  return `Unscripted speaking practice with ${ctx.labelOf(tags[0]!.tag)} in mind.`;
}

export function carriedOverRationale(tag: string | null, ctx: RationaleContext): string {
  if (!tag) {
    return 'Carried over from your previous plan.';
  }
  return `Carried over from your previous plan: ${ctx.labelOf(tag)} is still unmastered.`;
}

export function generalModeRationale(): string {
  return GENERAL_RATIONALE;
}
