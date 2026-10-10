'use client';

import type { LedgerEntryView, ProgressDashboardView } from '@english-quest/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { LedgerEntrySheet } from '@/components/profile/ledger-entry-sheet';
import { RecurringWeaknesses } from '@/components/profile/recurring-weaknesses';
import { ArrowRightIcon, Card, EmptyState, ErrorState } from '@/components/ui';
import { fetchProgress } from '@/lib/progress';
import { CompetencyChartCard } from './competency-chart-card';
import { ProgressSkeleton } from './progress-skeleton';

interface OpenEntry {
  id: string;
  label: string;
}

export interface ProgressScreenProps {
  /** The server-side read; null when it failed, so the screen loads from the browser. */
  initialView: ProgressDashboardView | null;
}

/**
 * The progress dashboard (F20): how the six competencies have changed over
 * time, then what keeps going wrong. No mockup exists for this screen; it is
 * composed from the design-system primitives only. The recurring weaknesses
 * are F12's list and detail, unchanged, so the two screens cannot disagree.
 */
export function ProgressScreen({ initialView }: ProgressScreenProps) {
  const [view, setView] = useState<ProgressDashboardView | null>(initialView);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<OpenEntry | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setFailed(false);
    fetchProgress()
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The server's read is the first paint; only a failed one needs the browser.
    if (initialView) {
      return;
    }
    return load();
  }, [initialView, load]);

  const openEntry = useCallback((entry: LedgerEntryView, from: HTMLButtonElement) => {
    trigger.current = from;
    setOpen({ id: entry.id, label: entry.label });
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    trigger.current?.focus();
  }, []);

  let body;
  if (failed) {
    body = (
      <ErrorState
        title="Your progress could not be loaded."
        description="Check your connection and try again."
        onRetry={load}
      />
    );
  } else if (!view) {
    body = <ProgressSkeleton />;
  } else if (view.profile.empty) {
    body = (
      <Card>
        <EmptyState
          title="No progress yet."
          description="Your progress appears after your first analysed lesson."
          action={{ label: 'Open classroom', href: '/classroom' }}
        />
      </Card>
    );
  } else {
    body = (
      <>
        {view.profile.notes.length > 0 ? (
          <Card tone="info" as="div" role="note">
            <div className="flex flex-col gap-xs">
              {view.profile.notes.map((note) => (
                <p key={note} className="text-body-md">
                  {note}
                </p>
              ))}
            </div>
          </Card>
        ) : null}
        <CompetencyChartCard view={view} />
        <Card header={<h3 className="text-title-lg text-on-surface">Recurring weaknesses</h3>}>
          <RecurringWeaknesses
            entries={view.profile.recurringWeaknesses}
            serverTime={view.profile.serverTime}
            onOpen={openEntry}
          />
        </Card>
      </>
    );
  }

  return (
    <main className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <Link
          href="/profile"
          className="inline-flex items-center gap-xs self-start text-label-lg text-primary underline outline-offset-2 outline-outline-strong focus-visible:outline-2"
        >
          <span className="inline-flex rotate-180">
            <ArrowRightIcon size={16} />
          </span>
          Back to profile
        </Link>
        <h2 className="text-headline-sm text-on-surface">Progress</h2>
        <p className="text-body-md text-on-surface-variant">How your competencies have changed, and what keeps coming back.</p>
      </div>
      {body}
      {open ? <LedgerEntrySheet entryId={open.id} label={open.label} onClose={close} /> : null}
    </main>
  );
}
