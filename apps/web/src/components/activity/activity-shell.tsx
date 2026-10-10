'use client';

import type { ActivityView } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ActivityKindIcon } from '@/components/plan/activity-kind-icon';
import { Button, CloseIcon } from '@/components/ui';
import { TODAY_HREF } from '@/lib/activity-navigation';
import { SessionProgress } from './session-progress';
import { SkipActivityDialog } from './skip-activity-dialog';

export interface ActivityShellProps {
  view: ActivityView;
  /** Hides Skip: the activity is already finished or cannot change. */
  canSkip?: boolean;
  children: ReactNode;
}

/**
 * The full-screen frame every activity runs in (A21), with nothing
 * objective-specific in it: Close, the activity's icon and title, the
 * session progress and Skip. Close goes back to where the learner came
 * from, or to Today when there is nowhere to go back to.
 */
export function ActivityShell({ view, canSkip = true, children }: ActivityShellProps) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const { activity, session } = view;
  const skippable = canSkip && !activity.readOnly && (activity.state === 'pending' || activity.state === 'in_progress');

  function close(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(TODAY_HREF);
    }
  }

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-wrap items-center gap-md rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md">
        <button
          type="button"
          aria-label="Close activity"
          onClick={close}
          className="press-button flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-outline-strong bg-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          <CloseIcon size={20} />
        </button>
        <div className="flex min-w-0 items-center gap-sm">
          <ActivityKindIcon kind={activity.kind} size={20} />
          <h1 className="truncate text-title-md text-on-surface">{activity.title}</h1>
        </div>
        <SessionProgress session={session} currentId={activity.id} />
        {skippable ? (
          <Button type="button" variant="neutral" size="sm" onClick={() => setSkipping(true)}>
            Skip
          </Button>
        ) : null}
      </header>
      {children}
      <SkipActivityDialog open={skipping} onClose={() => setSkipping(false)} view={view} />
    </div>
  );
}
