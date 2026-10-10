import type { ActivitySession } from '@english-quest/shared';

import { cn } from '@/components/ui';

/**
 * Where this activity sits in the day's session: one segment per activity
 * (done, current, pending), a `progressbar` for assistive technology and
 * the position as text (`Activity 2 of 3`).
 */
export function SessionProgress({ session, currentId }: { session: ActivitySession; currentId: string }) {
  const activities = [...session.activities].sort((a, b) => a.position - b.position);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-xs">
      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={1}
        aria-valuemax={session.count}
        aria-valuenow={session.position}
        aria-valuetext={`Activity ${session.position} of ${session.count}`}
        className="flex gap-xs"
      >
        {activities.map((activity) => (
          <span
            key={activity.id}
            className={cn(
              'h-sm flex-1 rounded-full border-2 border-outline-strong',
              activity.id === currentId
                ? 'bg-secondary'
                : activity.state === 'completed' || activity.state === 'skipped'
                  ? 'bg-primary'
                  : 'bg-surface-container-highest',
            )}
          />
        ))}
      </div>
      <p className="text-label-md text-on-surface-variant">
        Activity {session.position} of {session.count}
      </p>
    </div>
  );
}
