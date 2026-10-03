import type { CurrentPlanView, MaskedCredential, PlanActivityView, StudyPlanView } from '@english-quest/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card, EmptyState, VoiceIcon } from '@/components/ui';
import { activityHref } from '@/lib/activity-routes';
import type { ServerRead } from '@/lib/plans-server';

function CardShell({ children }: { children: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-outline-strong bg-badge-danger-bg">
        <VoiceIcon />
      </div>
      {children}
    </Card>
  );
}

/** The earliest-day, earliest-position unfinished `pronunciation`/`speaking` activity across the whole plan (A25). */
function nextSpeakingActivity(plan: StudyPlanView): PlanActivityView | null {
  const candidates = plan.sessions
    .flatMap((session) => session.activities)
    .filter(
      (activity) =>
        (activity.kind === 'pronunciation' || activity.kind === 'speaking') && (activity.state === 'pending' || activity.state === 'in_progress'),
    );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((earliest, activity) =>
    activity.day < earliest.day || (activity.day === earliest.day && activity.position < earliest.position) ? activity : earliest,
  );
}

function azureKeyReady(credentials: MaskedCredential[] | null): boolean {
  return credentials?.some((credential) => credential.provider === 'azure_speech' && credential.status === 'valid') ?? false;
}

/** The `Treino de Pronúncia` module card: standalone under `TodaySessionCard`, same precedent as F15's card (A25). */
export function PronunciationPracticeCard({
  current,
  credentials,
}: {
  current: ServerRead<CurrentPlanView>;
  credentials: MaskedCredential[] | null;
}) {
  const plan = current.ok ? current.data.plan : null;

  if (!plan) {
    return (
      <CardShell>
        <EmptyState
          title="Pronunciation practice"
          description="Read-aloud and speaking practice appear in your study plan after your first lesson."
        />
      </CardShell>
    );
  }

  if (!azureKeyReady(credentials)) {
    return (
      <CardShell>
        <EmptyState
          title="Pronunciation practice"
          description="Add your Azure Speech key to use speaking activities."
          action={{ label: 'Open settings', href: '/settings' }}
        />
      </CardShell>
    );
  }

  const next = nextSpeakingActivity(plan);
  if (!next) {
    return (
      <CardShell>
        <h3 className="text-headline-sm text-on-surface">Pronunciation practice</h3>
        <p className="text-body-md text-on-surface-variant">Every speaking activity in this plan is done.</p>
        <Link href="/plan" className="text-label-lg text-primary underline-offset-4 hover:underline">
          See the full plan
        </Link>
      </CardShell>
    );
  }

  const href = activityHref(next);

  return (
    <CardShell>
      <h3 className="text-headline-sm text-on-surface">Pronunciation practice</h3>
      <p className="text-body-md text-on-surface">{next.title}</p>
      <p className="text-label-md text-on-surface-variant">{next.estimatedMinutes} min</p>
      {href ? (
        <Link
          href={href}
          className="press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-secondary px-md py-sm text-label-lg font-semibold text-on-secondary outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          Practice now
        </Link>
      ) : null}
    </CardShell>
  );
}
