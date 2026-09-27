import type { StudyPlanView } from '@english-quest/shared';

import { LocalizedTime } from '@/components/lessons/localized-time';
import { Meter } from '@/components/ui';

import { ORIGIN_LABEL } from './plan-history-list';
import { PlanDay } from './plan-day';
import { PlanNotes } from './plan-notes';

/** A past plan, read-only: no status banner, no retry, every day starts collapsed. */
export function PlanDetailScreen({ plan }: { plan: StudyPlanView }) {
  const carriedOverCount = plan.sessions.flatMap((session) => session.activities).filter((activity) => activity.carriedOver).length;

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-col gap-xs">
        <p className="text-label-md text-on-surface-variant">
          {ORIGIN_LABEL[plan.origin]} · <LocalizedTime iso={plan.lessonDate} format="absolute" />
        </p>
        {plan.archivedAt ? (
          <p className="text-body-sm text-on-surface-variant">
            Archived <LocalizedTime iso={plan.archivedAt} format="relative" />
          </p>
        ) : null}
      </header>
      <div className="flex flex-col gap-sm">
        <p className="text-body-md text-on-surface">{plan.summaryLine}</p>
        <Meter value={plan.progress.completionPercent} label="Plan progress" />
        {carriedOverCount > 0 ? (
          <p className="text-body-sm text-on-surface-variant">{carriedOverCount} carried over from the previous plan</p>
        ) : null}
      </div>
      <PlanNotes notes={plan.notes} />
      <div className="flex flex-col gap-sm">
        {plan.sessions.map((session) => (
          <PlanDay key={session.day} session={session} isToday={false} />
        ))}
      </div>
    </div>
  );
}
