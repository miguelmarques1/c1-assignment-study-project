/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
   The plot is one composite widget with a single tab stop, like a slider: arrow keys step through
   moments and the group's name summarises it. No ARIA role fits a chart that is also keyboard operable. */
'use client';

import type { CompetencyHistorySeries, ProfileCompetency } from '@english-quest/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

import { COMPETENCY_LABELS } from '@/components/profile/competency-meters';
import { cn } from '@/components/ui';
import {
  CHART_COMPETENCIES,
  drawsLine,
  markerFor,
  momentsOf,
  nearestMoment,
  plotRect,
  seriesRole,
  timeTicks,
  xOf,
  yOf,
  Y_TICKS,
  type ChartDomain,
  type ChartMoment,
} from '@/lib/progress-chart';
import { formatShortDate } from '@/lib/relative-time';
import { diamondPoints, FILL_CLASS, SeriesKey, STROKE_CLASS } from './series-key';

/** The width the plot takes before it is measured, and in tests (jsdom has no `ResizeObserver`). */
const FALLBACK_WIDTH = 640;
const HEIGHT = 288;
const CIRCLE_RADIUS = 4;
const DIAMOND_SIZE = 10;

export function momentLabel(moment: ChartMoment, serverTime: string): string {
  const source = moment.sourceKind === 'lesson' ? 'Lesson' : 'Activity';
  return `${source} · ${formatShortDate(new Date(moment.measuredAt), new Date(serverTime))}`;
}

/** The moment as a sentence for the live region: source and date, then every value. */
export function momentAnnouncement(moment: ChartMoment, serverTime: string): string {
  const values = moment.entries.map((entry) => `${COMPETENCY_LABELS[entry.competency]} ${entry.score}`).join(', ');
  return `${momentLabel(moment, serverTime)}. ${values}.`;
}

export interface CompetencyChartProps {
  /** Every competency's points already inside the selected range. */
  series: CompetencyHistorySeries[];
  visible: readonly ProfileCompetency[];
  domain: ChartDomain;
  warmingUp: Record<ProfileCompetency, boolean>;
  /** The plot's accessible name, which summarises it. */
  summary: string;
  serverTime: string;
}

function Tooltip({ moment, serverTime, left }: { moment: ChartMoment; serverTime: string; left: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="chart-tooltip"
      style={{ left: `${left}%` }}
      className={cn(
        'pointer-events-none absolute top-0 z-10 flex min-w-40 flex-col gap-xs rounded-md border-2 border-outline-strong bg-surface-container-lowest p-sm shadow-card',
        left > 60 ? '-translate-x-full' : 'translate-x-sm',
      )}
    >
      <p className="text-label-md text-on-surface">{momentLabel(moment, serverTime)}</p>
      <ul className="flex flex-col gap-xs">
        {moment.entries.map((entry) => (
          <li key={entry.competency} className="flex items-center gap-sm text-body-sm text-on-surface">
            <SeriesKey competency={entry.competency} />
            <span className="text-label-md">{entry.score}</span>
            <span className="text-on-surface-variant">{COMPETENCY_LABELS[entry.competency]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The competency chart (F20), drawn as SVG at the container's measured width
 * from the shared pure model, with no charting library. A vertical crosshair
 * snaps to the nearest moment under the pointer and one tooltip lists every
 * visible competency at it. The plot is a single tab stop: arrow keys step
 * through moments, and a polite live region repeats what the tooltip shows.
 */
export function CompetencyChart({ series, visible, domain, warmingUp, summary, serverTime }: CompetencyChartProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(Math.round(next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const plot = useMemo(() => plotRect(width, HEIGHT), [width]);
  const moments = useMemo(() => momentsOf(series, visible), [series, visible]);
  const ticks = useMemo(() => timeTicks(domain, plot.width), [domain, plot.width]);
  const now = useMemo(() => new Date(serverTime), [serverTime]);
  // A change of range or visibility can shorten the list under a stepped-to index.
  const active = selected !== null && selected < moments.length ? moments[selected]! : null;

  const select = useCallback((index: number | null) => setSelected(index), []);

  function onMouseMove(event: MouseEvent<HTMLDivElement>): void {
    if (moments.length === 0) {
      return;
    }
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const fraction = plot.width === 0 ? 0 : Math.min(1, Math.max(0, (x - plot.left) / plot.width));
    const nearest = nearestMoment(moments, domain.from + fraction * (domain.to - domain.from));
    select(nearest ? moments.indexOf(nearest) : null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (moments.length === 0) {
      return;
    }
    const last = moments.length - 1;
    let next: number | null;
    switch (event.key) {
      case 'ArrowRight':
        next = active === null ? 0 : Math.min(last, (selected ?? 0) + 1);
        break;
      case 'ArrowLeft':
        next = active === null ? last : Math.max(0, (selected ?? 0) - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      case 'Escape':
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next);
  }

  const activeX = active ? xOf(active.at, domain, plot) : 0;

  return (
    <div
      ref={container}
      role="group"
      aria-label={summary}
      tabIndex={0}
      onMouseMove={onMouseMove}
      onMouseLeave={() => select(null)}
      onKeyDown={onKeyDown}
      className="relative w-full rounded-md outline-offset-2 outline-outline-strong focus-visible:outline-2"
    >
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} aria-hidden="true" className="block max-w-full">
        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={yOf(tick, plot)}
              y2={yOf(tick, plot)}
              strokeWidth={1}
              className="stroke-outline-variant"
            />
            <text
              x={plot.left - 8}
              y={yOf(tick, plot)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-on-surface-variant text-label-sm"
            >
              {tick}
            </text>
          </g>
        ))}
        {ticks.map((tick, index) => (
          <text
            key={tick}
            x={xOf(tick, domain, plot)}
            y={plot.top + plot.height + 18}
            textAnchor={ticks.length === 1 ? 'middle' : index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
            className="fill-on-surface-variant text-label-sm"
          >
            {formatShortDate(new Date(tick), now)}
          </text>
        ))}
        {active ? (
          <line
            x1={activeX}
            x2={activeX}
            y1={plot.top}
            y2={plot.top + plot.height}
            strokeWidth={1}
            data-testid="chart-crosshair"
            className="stroke-outline-strong"
          />
        ) : null}
        {CHART_COMPETENCIES.filter((competency) => visible.includes(competency)).map((competency) => {
          const entry = series.find((candidate) => candidate.competency === competency);
          if (!entry || entry.points.length === 0) {
            return null;
          }
          const role = seriesRole(competency);
          const coordinates = entry.points.map((point) => ({
            x: xOf(Date.parse(point.measuredAt), domain, plot),
            y: yOf(point.score, plot),
            shape: markerFor(point.sourceKind),
            key: `${point.measuredAt}-${point.sourceKind}`,
          }));
          return (
            <g key={competency} data-series={competency}>
              {drawsLine(entry.points.length, warmingUp[competency]) ? (
                <path
                  d={coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  className={STROKE_CLASS[role]}
                />
              ) : null}
              {coordinates.map((point) =>
                point.shape === 'circle' ? (
                  <circle
                    key={point.key}
                    data-marker="circle"
                    cx={point.x}
                    cy={point.y}
                    r={CIRCLE_RADIUS}
                    strokeWidth={2}
                    className={cn(FILL_CLASS[role], 'stroke-surface-container-lowest')}
                  />
                ) : (
                  <g key={point.key} data-marker="diamond">
                    <polygon points={diamondPoints(point.x, point.y, DIAMOND_SIZE + 4)} className="fill-surface-container-lowest" />
                    <polygon
                      points={diamondPoints(point.x, point.y, DIAMOND_SIZE)}
                      strokeWidth={2}
                      className={cn('fill-surface-container-lowest', STROKE_CLASS[role])}
                    />
                  </g>
                ),
              )}
            </g>
          );
        })}
      </svg>
      {active ? <Tooltip moment={active} serverTime={serverTime} left={(activeX / width) * 100} /> : null}
      <div aria-live="polite" className="sr-only">
        {active ? momentAnnouncement(active, serverTime) : ''}
      </div>
    </div>
  );
}
