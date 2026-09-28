import type { PlanSessionSummary } from '@english-quest/shared';

function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/**
 * `3 activities completed · 1 skipped · 8 of 10 correct · 18 min`, each part
 * dropped when it doesn't apply. `completionPercent`, when passed, adds the
 * plan-wide figure — the Today card's "completed today" state shows both.
 */
export function SessionSummary({
  summary,
  completionPercent,
}: {
  summary: PlanSessionSummary;
  completionPercent?: number;
}) {
  const parts: string[] = [`${summary.completed} ${summary.completed === 1 ? 'activity' : 'activities'} completed`];
  if (summary.skipped > 0) {
    parts.push(`${summary.skipped} skipped`);
  }
  if (summary.correct !== null && summary.questions !== null) {
    parts.push(`${summary.correct} of ${summary.questions} correct`);
  }
  if (summary.timeSpentSeconds !== null) {
    parts.push(formatMinutes(summary.timeSpentSeconds));
  }
  if (typeof completionPercent === 'number') {
    parts.push(`plan ${completionPercent}% complete`);
  }

  return <p className="text-body-sm text-on-surface-variant">{parts.join(' · ')}</p>;
}
