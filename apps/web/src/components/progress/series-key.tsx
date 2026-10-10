import type { ProfileCompetency } from '@english-quest/shared';

import { cn } from '@/components/ui';
import { seriesRole, type ChartColourRole, type MarkerShape } from '@/lib/progress-chart';

/**
 * Every colour class is spelled out in full: Tailwind and the token scanner
 * both read class names from source, so a template literal built from the
 * role would resolve to nothing.
 */
export const STROKE_CLASS: Record<ChartColourRole, string> = {
  'chart-1': 'stroke-chart-1',
  'chart-2': 'stroke-chart-2',
  'chart-3': 'stroke-chart-3',
  'chart-4': 'stroke-chart-4',
  'chart-5': 'stroke-chart-5',
  'chart-6': 'stroke-chart-6',
};

export const FILL_CLASS: Record<ChartColourRole, string> = {
  'chart-1': 'fill-chart-1',
  'chart-2': 'fill-chart-2',
  'chart-3': 'fill-chart-3',
  'chart-4': 'fill-chart-4',
  'chart-5': 'fill-chart-5',
  'chart-6': 'fill-chart-6',
};

/** A diamond centred on (x, y), `size` across. */
export function diamondPoints(x: number, y: number, size: number): string {
  const half = size / 2;
  return `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`;
}

/** The marker as a small icon: a filled circle for a lesson, a hollow diamond for an activity. */
export function MarkerGlyph({ shape }: { shape: MarkerShape }) {
  return (
    <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true" className="shrink-0">
      {shape === 'circle' ? (
        <circle cx={6} cy={6} r={4} className="fill-on-surface" />
      ) : (
        <polygon points={diamondPoints(6, 6, 10)} strokeWidth={2} className="fill-surface-container-lowest stroke-on-surface" />
      )}
    </svg>
  );
}

/** A short line in the series colour: the identity of a series next to its name, in the legend, tooltip and table. */
export function SeriesKey({ competency, dimmed = false }: { competency: ProfileCompetency; dimmed?: boolean }) {
  const role = seriesRole(competency);
  return (
    <svg viewBox="0 0 20 8" width={20} height={8} aria-hidden="true" className={cn('shrink-0', dimmed && 'opacity-50')}>
      <line x1={1} y1={4} x2={19} y2={4} strokeWidth={2} strokeLinecap="round" className={STROKE_CLASS[role]} />
    </svg>
  );
}
