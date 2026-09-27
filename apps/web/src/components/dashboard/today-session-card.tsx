'use client';

import type { CurrentPlanView, PlanActivityView, PlanSessionView } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { AreaError } from '@/components/lessons/area-error';
import { AutoRefresh } from '@/components/lessons/auto-refresh';
import { ActivityKindIcon } from '@/components/plan/activity-kind-icon';
import { ActivityStateBadge } from '@/components/plan/activity-state-badge';
import { SessionSummary } from '@/components/plan/session-summary';
import { ArrowRightIcon, BookIcon, Button, Card, EmptyState } from '@/components/ui';
import { activityHref } from '@/lib/activity-routes';
import { selectTodaySession, type TodaySelection } from '@/lib/plan-today';
import { retryPlan } from '@/lib/plans';
import type { ServerRead } from '@/lib/plans-server';

/**
 * The next unfinished activity's route, or null when it isn't routable yet
 * (F16–F18 haven't registered its kind) — never skip ahead to a later one
 * just because it happens to be routable (A22).
 */
function nextRoutableActivity(session: PlanSessionView): { activity: PlanActivityView; href: string } | null {
  const next = session.activities.find((activity) => activity.state === 'pending' || activity.state === 'in_progress');
  if (!next) {
    return null;
  }
  const href = activityHref(next);
  return href ? { activity: next, href } : null;
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-outline-strong bg-badge-success-bg">
        <BookIcon />
      </div>
      {children}
    </Card>
  );
}

/** The `Lições Diárias` module card: what to do today, wherever the plan currently stands. */
export function TodaySessionCard({ current }: { current: ServerRead<CurrentPlanView> }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const plan = current.ok ? current.data.plan : null;
  const [selection, setSelection] = useState<TodaySelection | null>(() =>
    plan ? selectTodaySession(plan, new Date()) : null,
  );

  useEffect(() => {
    setSelection(plan ? selectTodaySession(plan, new Date()) : null);
  }, [plan]);

  if (!current.ok) {
    return <AreaError title="We could not load your plan." />;
  }

  const { preparing, failure } = current.data;

  if (preparing) {
    return (
      <CardShell>
        <AutoRefresh active />
        <h3 className="text-headline-sm text-on-surface">Today’s session</h3>
        <p className="text-body-md text-on-surface-variant">Preparing your plan…</p>
        {preparing.progress ? (
          <p className="text-label-md text-on-surface-variant">
            {preparing.progress.done} of {preparing.progress.total}
          </p>
        ) : null}
      </CardShell>
    );
  }

  if (failure) {
    return (
      <CardShell>
        <h3 className="text-headline-sm text-on-surface">Today’s session</h3>
        <p className="text-body-md text-on-surface-variant">{failure.message}</p>
        <Button
          variant="destructive"
          size="sm"
          loading={retrying}
          loadingLabel="Retrying…"
          onClick={async () => {
            setRetrying(true);
            try {
              await retryPlan();
              router.refresh();
            } finally {
              setRetrying(false);
            }
          }}
        >
          Retry
        </Button>
      </CardShell>
    );
  }

  if (!plan) {
    return (
      <CardShell>
        <EmptyState
          title="Today’s session"
          description="Your study plan appears after your first lesson."
          action={{ label: 'Open classroom', href: '/classroom' }}
        />
      </CardShell>
    );
  }

  if (!selection || selection.mode === 'plan_complete' || !selection.session) {
    return (
      <CardShell>
        <h3 className="text-headline-sm text-on-surface">Today’s session</h3>
        <p className="text-body-md text-on-surface-variant">You have completed every session in this plan.</p>
        <Link href="/plan" className="text-label-lg text-primary underline-offset-4 hover:underline">
          See the full plan
        </Link>
      </CardShell>
    );
  }

  const { session, mode } = selection;

  if (mode === 'completed_today') {
    return (
      <CardShell>
        <h3 className="text-headline-sm text-on-surface">Today’s session</h3>
        <SessionSummary summary={session.summary} completionPercent={plan.progress.completionPercent} />
        <Link href="/plan" className="text-label-lg text-primary underline-offset-4 hover:underline">
          Work ahead in Plan
        </Link>
      </CardShell>
    );
  }

  const next = nextRoutableActivity(session);

  return (
    <CardShell>
      <h3 className="text-headline-sm text-on-surface">Today’s session</h3>
      <p className="text-body-md text-on-surface-variant">
        Day {session.day} · {session.estimatedMinutes} min
      </p>
      <ul className="flex w-full flex-col gap-xs">
        {session.activities.map((activity) => (
          <li key={activity.id} className="flex items-center gap-sm">
            <ActivityKindIcon kind={activity.kind} size={16} />
            <span className="flex-1 text-body-sm text-on-surface">{activity.title}</span>
            <span className="text-label-sm text-on-surface-variant">{activity.estimatedMinutes} min</span>
            <ActivityStateBadge state={activity.state} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-md">
        {next ? (
          <Link
            href={next.href}
            className="press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-secondary px-md py-sm text-label-lg font-semibold text-on-secondary outline-offset-2 outline-outline-strong focus-visible:outline-2"
          >
            Start session
          </Link>
        ) : null}
        <Link
          href="/plan"
          className="inline-flex items-center gap-xs text-label-lg text-primary underline-offset-4 hover:underline"
        >
          See the full plan
          <ArrowRightIcon size={16} />
        </Link>
      </div>
    </CardShell>
  );
}
