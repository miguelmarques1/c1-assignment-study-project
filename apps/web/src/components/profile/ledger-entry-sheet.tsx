'use client';

import type { LedgerEntryDetailView, LedgerExampleView, LedgerSourceView } from '@english-quest/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, CloseIcon, ErrorState, LoadingState } from '@/components/ui';
import { fetchLedgerEntry } from '@/lib/profile';
import { formatRelativeTime } from '@/lib/relative-time';
import { STATE_BADGES } from './recurring-weaknesses';

/**
 * Where a lesson example links to. F19 owns the lesson-detail page; until it
 * ships `/lessons/{id}` this stays null and a lesson source renders as plain
 * text (F12 spec, A27). Whichever of F12 and F19 lands second sets it to
 * `(lessonId) => \`/lessons/${lessonId}\``. Activity sources stay unlinked
 * until F16–F18 give activities a page.
 */
export const LESSON_DETAIL_HREF: ((lessonId: string) => string) | null = null;

function timesLabel(count: number): string {
  return `${count} ${count === 1 ? 'time' : 'times'}`;
}

function SourceLine({
  source,
  serverTime,
}: {
  source: Pick<LedgerSourceView, 'sourceKind' | 'lessonId' | 'occurredAt'>;
  serverTime: string;
}) {
  const text = `${source.sourceKind === 'lesson' ? 'Lesson' : 'Activity'} · ${formatRelativeTime(source.occurredAt, serverTime)}`;
  if (source.sourceKind === 'lesson' && source.lessonId && LESSON_DETAIL_HREF) {
    return (
      <a href={LESSON_DETAIL_HREF(source.lessonId)} className="text-label-md text-primary underline">
        {text}
      </a>
    );
  }
  return <span className="text-label-md text-on-surface-variant">{text}</span>;
}

function Example({ example, serverTime }: { example: LedgerExampleView; serverTime: string }) {
  return (
    <li className="flex flex-col gap-xs rounded-md border-2 border-outline-strong bg-surface p-md">
      {example.quote ? (
        <>
          <p className="text-body-md text-on-surface">“{example.quote}”</p>
          {example.correction ? (
            <p className="text-body-sm text-on-surface-variant">Correction: {example.correction}</p>
          ) : null}
        </>
      ) : (
        <p className="text-body-md text-on-surface">
          Words: {example.exampleWords.map((word) => `“${word}”`).join(', ')}
          <span className="text-body-sm text-on-surface-variant">
            {' '}
            ({example.instances} failing {example.instances === 1 ? 'instance' : 'instances'})
          </span>
        </p>
      )}
      <SourceLine source={example} serverTime={serverTime} />
    </li>
  );
}

function Detail({ detail }: { detail: LedgerEntryDetailView }) {
  const { entry, serverTime } = detail;
  const state = STATE_BADGES[entry.state];
  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        <Badge status={state.status}>{state.label}</Badge>
        {entry.retired ? <Badge status="neutral">Retired</Badge> : null}
      </div>
      <p className="text-body-md text-on-surface-variant">
        Seen {timesLabel(entry.occurrenceCount)} · first seen {formatRelativeTime(entry.firstSeenAt, serverTime)} ·
        last seen {formatRelativeTime(entry.lastSeenAt, serverTime)}
      </p>
      <section className="flex flex-col gap-sm">
        <h3 className="text-title-md text-on-surface">Examples</h3>
        {detail.examples.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No examples were recorded for this tag.</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {detail.examples.map((example, index) => (
              <Example key={index} example={example} serverTime={serverTime} />
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-sm">
        <h3 className="text-title-md text-on-surface">Sources</h3>
        <ul className="flex flex-col gap-xs">
          {detail.sources.map((source, index) => (
            <li key={index} className="flex flex-wrap items-center gap-sm">
              <SourceLine source={source} serverTime={serverTime} />
              <span className="text-body-sm text-on-surface-variant">{timesLabel(source.occurrences)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export interface LedgerEntrySheetProps {
  entryId: string;
  /** The tag's human-readable name, known before the detail loads; the dialog's accessible name. */
  label: string;
  onClose: () => void;
}

/**
 * The detail a recurring-weakness row opens: every example collected for
 * the tag, each with the lesson or activity it came from, and the sources
 * list. A modal dialog: focus moves in on open, Escape closes it, and the
 * screen returns focus to the row that opened it.
 */
export function LedgerEntrySheet({ entryId, label, onClose }: LedgerEntrySheetProps) {
  const [detail, setDetail] = useState<LedgerEntryDetailView | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setFailed(false);
    setDetail(null);
    fetchLedgerEntry(entryId)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-outline-strong/60 p-md backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-entry-title"
        className="relative flex max-h-full w-full max-w-136 flex-col gap-md overflow-y-auto rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-modal"
      >
        <div className="flex items-start justify-between gap-md">
          <h2 id="ledger-entry-title" className="text-headline-sm text-on-surface">
            {label}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press-button flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-outline-strong bg-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        {failed ? (
          <ErrorState
            title="This record could not be loaded."
            description="Check your connection and try again."
            onRetry={load}
          />
        ) : detail ? (
          <Detail detail={detail} />
        ) : (
          <LoadingState variant="list" label="Loading examples…" />
        )}
      </div>
    </div>
  );
}
