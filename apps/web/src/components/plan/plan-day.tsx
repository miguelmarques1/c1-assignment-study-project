'use client';

import type { PlanSessionView } from '@english-quest/shared';
import { useEffect, useState } from 'react';

import { PlanActivityCard } from './plan-activity-card';

/**
 * One of the plan's 7 days, collapsed unless it's `Today`'s. The parent only
 * learns which day that is after mount (A16 needs the viewer's own clock),
 * so this also opens in response to `isToday` turning true later, not just
 * on its initial value — and never auto-closes a day the viewer opened.
 */
export function PlanDay({ session, isToday }: { session: PlanSessionView; isToday: boolean }) {
  const [open, setOpen] = useState(isToday);

  useEffect(() => {
    if (isToday) {
      setOpen(true);
    }
  }, [isToday]);
  const done = session.activities.filter((activity) => activity.state === 'completed').length;
  const listId = `plan-day-${session.day}-activities`;

  return (
    <div className="flex flex-col gap-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-sm rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-label-lg text-on-surface"
      >
        <span>
          Day {session.day} · {session.estimatedMinutes} min · {done} of {session.activities.length} done
        </span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <ul id={listId} className="flex flex-col gap-sm">
          {session.activities.map((activity) => (
            <PlanActivityCard key={activity.id} activity={activity} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
