'use client';

import type { CurrentPlanView, PlanHistoryView } from '@english-quest/shared';
import { useEffect, useState } from 'react';

import { AreaError } from '@/components/lessons/area-error';
import { EmptyState, Meter } from '@/components/ui';
import { selectTodaySession } from '@/lib/plan-today';
import type { ServerRead } from '@/lib/plans-server';

import { PlanDay } from './plan-day';
import { PlanHistoryList } from './plan-history-list';
import { PlanNotes } from './plan-notes';
import { PlanStatusBanner } from './plan-status-banner';

/**
 * `/plan`'s body. `today` starts `null` so the server-rendered markup and the
 * first client render agree (every day collapsed); an effect opens `Today`'s
 * day right after mount, using the viewer's own clock (A16), the same
 * SSR-then-correct dance `LocalizedTime` uses for the same reason.
 */
export function PlanScreen({
  current,
  history,
}: {
  current: ServerRead<CurrentPlanView>;
  history: ServerRead<PlanHistoryView>;
}) {
  const [today, setToday] = useState<number | null>(null);
  const plan = current.ok ? current.data.plan : null;

  useEffect(() => {
    if (plan) {
      setToday(selectTodaySession(plan, new Date()).session?.day ?? null);
    }
  }, [plan]);

  if (!current.ok) {
    return <AreaError title="We could not load your plan." />;
  }

  const { preparing, failure } = current.data;
  const carriedOverCount = plan ? plan.sessions.flatMap((session) => session.activities).filter((activity) => activity.carriedOver).length : 0;

  return (
    <div className="flex flex-col gap-lg">
      <PlanStatusBanner preparing={preparing} failure={failure} />
      {plan ? (
        <>
          <div className="flex flex-col gap-sm">
            <p className="text-body-md text-on-surface">{plan.summaryLine}</p>
            <Meter value={plan.progress.completionPercent} label="Plan progress" />
            {carriedOverCount > 0 ? (
              <p className="text-body-sm text-on-surface-variant">
                {carriedOverCount} carried over from your previous plan
              </p>
            ) : null}
          </div>
          <PlanNotes notes={plan.notes} />
          <div className="flex flex-col gap-sm">
            {plan.sessions.map((session) => (
              <PlanDay key={session.day} session={session} isToday={session.day === today} />
            ))}
          </div>
        </>
      ) : !preparing && !failure ? (
        <EmptyState
          title="No plan yet"
          description="Your study plan appears after your first lesson."
          action={{ label: 'Open classroom', href: '/classroom' }}
        />
      ) : null}
      {history.ok && history.data.plans.length > 0 ? (
        <section className="flex flex-col gap-sm">
          <h2 className="text-headline-sm text-on-surface">Previous plans</h2>
          <PlanHistoryList plans={history.data.plans} />
        </section>
      ) : null}
    </div>
  );
}
