import type { PackedActivity, PackedSession } from './session-packer';
import type { RankedPlanTag } from './tag-priority';

/** Up to 3 tags, ranked by how many activities in the plan target them, then by tag priority (spec §5 "StudyPlanView"). */
export function focusTagsOf(activities: readonly PackedActivity[], priority: ReadonlyMap<string, RankedPlanTag>): string[] {
  const counts = new Map<string, number>();
  for (const activity of activities) {
    for (const tag of activity.targetTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (priority.get(a[0])?.rank ?? Number.MAX_SAFE_INTEGER) - (priority.get(b[0])?.rank ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 3)
    .map(([tag]) => tag);
}

function joinWithAnd(items: readonly string[]): string {
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** `7 sessions · 21 activities · focused on third conditional, phrasal verb and /θ/` (PRD's example line). */
export function summaryLine(sessions: readonly PackedSession[], activities: readonly PackedActivity[], focusLabels: readonly string[], generalMode: boolean): string {
  const base = `${sessions.length} sessions · ${activities.length} activities`;
  if (generalMode || focusLabels.length === 0) {
    return base;
  }
  return `${base} · focused on ${joinWithAnd(focusLabels)}`;
}
