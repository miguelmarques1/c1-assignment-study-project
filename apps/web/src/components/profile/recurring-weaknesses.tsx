'use client';

import type { BadgeStatus } from '@english-quest/design-tokens';
import type { LedgerEntryView, LedgerState, TagTrend } from '@english-quest/shared';

import { Badge, cn } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relative-time';

export const STATE_BADGES: Record<LedgerState, { status: BadgeStatus; label: string }> = {
  new: { status: 'info', label: 'New' },
  practicing: { status: 'warning', label: 'Practicing' },
  mastered: { status: 'success', label: 'Mastered' },
};

/** Arrow plus word, so the trend is never carried by colour alone. For an error, rising is the bad direction. */
const TRENDS: Record<TagTrend, { symbol: string; word: string; className: string }> = {
  rising: { symbol: '▲', word: 'Rising', className: 'text-error' },
  falling: { symbol: '▼', word: 'Falling', className: 'text-tertiary' },
  flat: { symbol: '▶', word: 'Steady', className: 'text-on-surface-variant' },
};

function timesLabel(count: number): string {
  return `${count} ${count === 1 ? 'time' : 'times'}`;
}

export interface RecurringWeaknessesProps {
  entries: LedgerEntryView[];
  serverTime: string;
  onOpen: (entry: LedgerEntryView, trigger: HTMLButtonElement) => void;
}

/**
 * One row per recurring weakness: the tag's human-readable name (never the
 * raw tag), how often it occurred, when it was last seen, its state and its
 * 30-day trend. Each row is a single control whose accessible name reads the
 * whole row, and opens the tag's detail.
 */
export function RecurringWeaknesses({ entries, serverTime, onOpen }: RecurringWeaknessesProps) {
  if (entries.length === 0) {
    return (
      <p className="text-body-md text-on-surface-variant">
        No recurring weaknesses yet. A tag appears here once it occurs 3 times within 30 days.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-sm">
      {entries.map((entry) => {
        const lastSeen = formatRelativeTime(entry.lastSeenAt, serverTime);
        const state = STATE_BADGES[entry.state];
        const trend = TRENDS[entry.trend];
        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={(event) => onOpen(entry, event.currentTarget)}
              aria-label={`${entry.label}: ${timesLabel(entry.occurrenceCount)}, last seen ${lastSeen}, ${state.label}, ${trend.word}`}
              className="press-card flex w-full flex-wrap items-center justify-between gap-sm rounded-md border-2 border-outline-strong bg-surface p-md text-left outline-offset-2 outline-outline-strong focus-visible:outline-2"
            >
              <span className="flex min-w-0 flex-col gap-xs">
                <span className="text-title-md text-on-surface">{entry.label}</span>
                <span className="text-body-sm text-on-surface-variant">
                  {timesLabel(entry.occurrenceCount)} · last seen {lastSeen}
                </span>
              </span>
              <span className="flex items-center gap-sm">
                <Badge status={state.status}>{state.label}</Badge>
                <span className={cn('text-label-md', trend.className)}>
                  {trend.symbol} {trend.word}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
