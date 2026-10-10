'use client';

import type { CompetencySnapshotView, CompetencyTrend, ProfileCompetency } from '@english-quest/shared';

import { COMPETENCY_LABELS } from '@/components/profile/competency-meters';
import { cn } from '@/components/ui';
import { SeriesKey } from './series-key';

/** Arrow plus word, so the trend is never carried by colour alone. For a score, up is the good direction. */
const TRENDS: Record<CompetencyTrend, { symbol: string; word: string; spoken: string; className: string }> = {
  up: { symbol: '▲', word: 'Improving', spoken: 'improving', className: 'text-tertiary' },
  down: { symbol: '▼', word: 'Declining', spoken: 'declining', className: 'text-error' },
  flat: { symbol: '▶', word: 'Steady', spoken: 'steady', className: 'text-on-surface-variant' },
};

function nameFor(entry: CompetencySnapshotView): string {
  const label = COMPETENCY_LABELS[entry.competency];
  if (entry.warmingUp || entry.score === null) {
    return `${label}: warming up`;
  }
  return entry.trend ? `${label}: ${entry.score}, ${TRENDS[entry.trend].spoken}` : `${label}: ${entry.score}`;
}

export interface CompetencyLegendProps {
  /** F12's six, in order: the snapshot the tiles show. */
  competencies: CompetencySnapshotView[];
  visible: readonly ProfileCompetency[];
  onToggle: (competency: ProfileCompetency) => void;
}

/**
 * The legend and the snapshot in one: six tiles, each with its series key,
 * the current score or `Warming up`, and the trend from three measurements
 * up. Each tile toggles that competency's line.
 */
export function CompetencyLegend({ competencies, visible, onToggle }: CompetencyLegendProps) {
  return (
    <ul className="grid grid-cols-2 gap-sm md:grid-cols-3">
      {competencies.map((entry) => {
        const shown = visible.includes(entry.competency);
        const trend = !entry.warmingUp && entry.trend ? TRENDS[entry.trend] : null;
        return (
          <li key={entry.competency}>
            <button
              type="button"
              aria-pressed={shown}
              aria-label={nameFor(entry)}
              onClick={() => onToggle(entry.competency)}
              className={cn(
                'flex min-h-12 w-full flex-col gap-xs rounded-md border-2 p-sm text-left outline-offset-2 outline-outline-strong focus-visible:outline-2',
                shown
                  ? 'border-outline-strong bg-surface-container-lowest text-on-surface'
                  : 'border-outline-variant bg-surface text-on-surface-variant',
              )}
            >
              <span className="flex items-center gap-sm">
                <SeriesKey competency={entry.competency} dimmed={!shown} />
                <span className="text-label-md">{COMPETENCY_LABELS[entry.competency]}</span>
              </span>
              <span className="flex flex-wrap items-baseline gap-sm">
                {entry.warmingUp || entry.score === null ? (
                  <span className="text-label-md text-on-surface-variant">Warming up</span>
                ) : (
                  <span className="text-title-lg">{entry.score}</span>
                )}
                {trend ? (
                  <span className={cn('text-label-sm', trend.className)}>
                    {trend.symbol} {trend.word}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
