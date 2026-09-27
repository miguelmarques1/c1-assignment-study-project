import type { PlanHistoryItem, StudyPlanOrigin } from '@english-quest/shared';
import Link from 'next/link';

import { LocalizedTime } from '@/components/lessons/localized-time';
import { Badge, Chip } from '@/components/ui';

export const ORIGIN_LABEL: Record<StudyPlanOrigin, string> = {
  lesson: 'From lesson',
  recording_failed: 'Recording failed',
  analysis_blocked: 'Analysis blocked',
};

function ratingParts(ratings: PlanHistoryItem['ratings']): string[] {
  const parts: string[] = [];
  if (ratings.tooEasy > 0) {
    parts.push(`${ratings.tooEasy} too easy`);
  }
  if (ratings.justRight > 0) {
    parts.push(`${ratings.justRight} just right`);
  }
  if (ratings.tooHard > 0) {
    parts.push(`${ratings.tooHard} too hard`);
  }
  if (ratings.notUseful > 0) {
    parts.push(`${ratings.notUseful} not useful`);
  }
  return parts;
}

/** The caller's previous plans, newest first, each opening its read-only detail. */
export function PlanHistoryList({ plans }: { plans: PlanHistoryItem[] }) {
  if (plans.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-sm">
      {plans.map((plan) => {
        const ratings = ratingParts(plan.ratings);
        return (
          <li key={plan.id}>
            <Link
              href={`/plan/${plan.id}`}
              className="press-card flex flex-col gap-xs rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md text-on-surface shadow-card outline-offset-2 outline-outline-strong focus-visible:outline-2"
            >
              <span className="flex flex-wrap items-center justify-between gap-sm">
                <span className="text-label-md text-on-surface-variant">
                  <LocalizedTime iso={plan.lessonDate} format="absolute" /> · {ORIGIN_LABEL[plan.origin]}
                </span>
                {plan.status === 'active' ? <Badge status="info">Current</Badge> : null}
              </span>
              <span className="text-body-md text-on-surface">
                {plan.completedCount} of {plan.activityCount} completed · {plan.completionPercent}%
              </span>
              {ratings.length > 0 ? (
                <span className="flex flex-wrap gap-xs">
                  {ratings.map((label) => (
                    <Chip key={label}>{label}</Chip>
                  ))}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
