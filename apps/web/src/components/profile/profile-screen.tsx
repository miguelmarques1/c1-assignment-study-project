'use client';

import type { LearningProfileView, LedgerEntryView } from '@english-quest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { fetchProfile, findLedgerEntryByTag } from '@/lib/profile';
import { CompetencyMeters } from './competency-meters';
import { LedgerEntrySheet } from './ledger-entry-sheet';
import { RecurringWeaknesses } from './recurring-weaknesses';

/** Shaped like what is coming: six meters, then weakness rows. */
function ProfileSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-lg">
      <span className="sr-only">Loading your profile…</span>
      <Card>
        <div className="flex flex-col gap-md">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="flex flex-col gap-xs">
              <Skeleton className="h-md w-1/3" />
              <Skeleton className="h-sm w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-sm">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    </div>
  );
}

interface OpenEntry {
  id: string;
  label: string;
}

export interface ProfileScreenProps {
  /** The server-side read; null when it failed, so the screen loads from the browser. */
  initialView: LearningProfileView | null;
  /** `/profile?tag=`: the tag whose detail opens on arrival (F19's error-card chip). */
  initialTag: string | null;
}

/**
 * The learning profile (F12): the six competencies as meters, Pronunciation
 * expanding to Accuracy and Prosody, and the recurring weaknesses, each
 * opening the examples the learner actually produced. No mockup exists for
 * this screen; it is composed from the design-system primitives only.
 */
export function ProfileScreen({ initialView, initialTag }: ProfileScreenProps) {
  const [view, setView] = useState<LearningProfileView | null>(initialView);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<OpenEntry | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setFailed(false);
    fetchProfile()
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

  useEffect(() => {
    if (!initialTag) {
      return;
    }
    let cancelled = false;
    findLedgerEntryByTag(initialTag)
      .then((entry) => {
        if (!cancelled && entry) setOpen({ id: entry.id, label: entry.label });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialTag]);

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
        title="Your profile could not be loaded."
        description="Check your connection and try again."
        onRetry={load}
      />
    );
  } else if (!view) {
    body = <ProfileSkeleton />;
  } else if (view.empty) {
    body = (
      <Card>
        <EmptyState
          title="No profile yet."
          description="Your competencies appear after your first analysed lesson."
          action={{ label: 'Open classroom', href: '/classroom' }}
        />
      </Card>
    );
  } else {
    body = (
      <>
        {view.notes.length > 0 ? (
          <Card tone="info" as="div" role="note">
            <div className="flex flex-col gap-xs">
              {view.notes.map((note) => (
                <p key={note} className="text-body-md">
                  {note}
                </p>
              ))}
            </div>
          </Card>
        ) : null}
        <Card header={<h3 className="text-title-lg text-on-surface">Competencies</h3>}>
          <CompetencyMeters competencies={view.competencies} />
        </Card>
        <Card header={<h3 className="text-title-lg text-on-surface">Recurring weaknesses</h3>}>
          <RecurringWeaknesses entries={view.recurringWeaknesses} serverTime={view.serverTime} onOpen={openEntry} />
        </Card>
      </>
    );
  }

  return (
    <main className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <h2 className="text-headline-sm text-on-surface">Learning profile</h2>
        <p className="text-body-md text-on-surface-variant">Smoothed across your recent lessons and activities.</p>
      </div>
      {body}
      {open ? <LedgerEntrySheet entryId={open.id} label={open.label} onClose={close} /> : null}
    </main>
  );
}
