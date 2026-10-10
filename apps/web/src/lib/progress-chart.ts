import type {
  CompetencyHistoryPoint,
  CompetencyHistorySeries,
  MeasurementSourceKind,
  ProfileCompetency,
  ProgressRange,
} from '@english-quest/shared';

/**
 * The progress chart's pure model (F20): filtering, domains, positions, ticks,
 * markers, moments and legend state, with no React and no DOM. Both clients
 * draw from it; the mobile twin is `progress_chart_model.dart`, pinned by the
 * same case table, so the axes and the data on the two clients cannot drift.
 * Times are epoch milliseconds.
 */

/** The learning profile's order, which is also the legend's and the colour order. */
export const CHART_COMPETENCIES: readonly ProfileCompetency[] = [
  'grammar',
  'vocabulary',
  'fluency',
  'interaction',
  'comprehension',
  'pronunciation',
];

export type ChartColourRole = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'chart-6';
export type MarkerShape = 'circle' | 'diamond';

export interface ChartDomain {
  from: number;
  to: number;
}

export interface ChartPlot {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One instant on the chart: a lesson, or an activity, with the visible competencies it measured. */
export interface ChartMoment {
  at: number;
  measuredAt: string;
  sourceKind: MeasurementSourceKind;
  lessonId: string | null;
  activityId: string | null;
  entries: { competency: ProfileCompetency; score: number }[];
}

/** Below this plot width the x axis carries three ticks instead of five. */
export const WIDE_PLOT_FROM = 480;

export const Y_TICKS: readonly number[] = [0, 25, 50, 75, 100];

const ROLE_BY_COMPETENCY: Record<ProfileCompetency, ChartColourRole> = {
  grammar: 'chart-1',
  vocabulary: 'chart-2',
  fluency: 'chart-3',
  interaction: 'chart-4',
  comprehension: 'chart-5',
  pronunciation: 'chart-6',
};

/** The margins around the plot rectangle: room for the y labels at the left and the x labels below. */
const MARGIN = { left: 36, right: 12, top: 12, bottom: 28 } as const;

export function plotRect(width: number, height: number): ChartPlot {
  return {
    left: MARGIN.left,
    top: MARGIN.top,
    width: Math.max(0, width - MARGIN.left - MARGIN.right),
    height: Math.max(0, height - MARGIN.top - MARGIN.bottom),
  };
}

/** Keeps points whose `measuredAt` is on or after `since`; `null` keeps every point. */
export function pointsInRange(points: readonly CompetencyHistoryPoint[], since: string | null): CompetencyHistoryPoint[] {
  if (since === null) {
    return [...points];
  }
  const boundary = Date.parse(since);
  return points.filter((point) => Date.parse(point.measuredAt) >= boundary);
}

export function seriesInRange(series: readonly CompetencyHistorySeries[], since: string | null): CompetencyHistorySeries[] {
  return series.map((entry) => ({ competency: entry.competency, points: pointsInRange(entry.points, since) }));
}

export function countPoints(series: readonly CompetencyHistorySeries[]): number {
  return series.reduce((total, entry) => total + entry.points.length, 0);
}

/**
 * `null` when no point is in range. Otherwise it runs from `since` (the
 * earliest in-range point for `All time`) to the server's now, computed over
 * every series so hiding a line never rescales the axis.
 */
export function chartDomain(
  inRange: readonly CompetencyHistorySeries[],
  since: string | null,
  serverTime: string,
): ChartDomain | null {
  let earliest: number | null = null;
  for (const entry of inRange) {
    for (const point of entry.points) {
      const at = Date.parse(point.measuredAt);
      if (earliest === null || at < earliest) {
        earliest = at;
      }
    }
  }
  if (earliest === null) {
    return null;
  }
  return { from: since === null ? earliest : Date.parse(since), to: Date.parse(serverTime) };
}

/** Linear in time; a single-instant domain centres its points. */
export function xOf(at: number, domain: ChartDomain, plot: ChartPlot): number {
  if (domain.to <= domain.from) {
    return plot.left + plot.width / 2;
  }
  const fraction = (at - domain.from) / (domain.to - domain.from);
  return plot.left + Math.min(1, Math.max(0, fraction)) * plot.width;
}

/** 0–100 mapped top-down. */
export function yOf(score: number, plot: ChartPlot): number {
  return plot.top + (1 - Math.min(100, Math.max(0, score)) / 100) * plot.height;
}

/** Evenly spaced instants including both ends: five from a plot width of 480, else three. */
export function timeTicks(domain: ChartDomain, plotWidth: number): number[] {
  if (domain.to <= domain.from) {
    return [domain.from];
  }
  const count = plotWidth >= WIDE_PLOT_FROM ? 5 : 3;
  return Array.from({ length: count }, (_, index) => domain.from + ((domain.to - domain.from) * index) / (count - 1));
}

/** A warming-up competency, or one with fewer than two points in range, is drawn as markers only. */
export function drawsLine(pointsInRangeCount: number, warmingUp: boolean): boolean {
  return !warmingUp && pointsInRangeCount >= 2;
}

export function markerFor(sourceKind: MeasurementSourceKind): MarkerShape {
  return sourceKind === 'lesson' ? 'circle' : 'diamond';
}

export function seriesRole(competency: ProfileCompetency): ChartColourRole {
  return ROLE_BY_COMPETENCY[competency];
}

/**
 * Groups points by (`measuredAt`, `sourceKind`): every competency one lesson
 * measured shares the lesson's start time, so a lesson is one moment. Sorted
 * by time, a lesson before an activity at the same instant; each moment lists
 * only the visible competencies, in the profile's order.
 */
export function momentsOf(
  inRange: readonly CompetencyHistorySeries[],
  visible: readonly ProfileCompetency[],
): ChartMoment[] {
  const byKey = new Map<string, ChartMoment>();
  for (const entry of inRange) {
    if (!visible.includes(entry.competency)) {
      continue;
    }
    for (const point of entry.points) {
      const key = `${point.measuredAt}|${point.sourceKind}`;
      let moment = byKey.get(key);
      if (!moment) {
        moment = {
          at: Date.parse(point.measuredAt),
          measuredAt: point.measuredAt,
          sourceKind: point.sourceKind,
          lessonId: point.lessonId,
          activityId: point.activityId,
          entries: [],
        };
        byKey.set(key, moment);
      }
      moment.entries.push({ competency: entry.competency, score: point.score });
    }
  }
  const order = (competency: ProfileCompetency) => CHART_COMPETENCIES.indexOf(competency);
  return [...byKey.values()]
    .map((moment) => ({ ...moment, entries: [...moment.entries].sort((a, b) => order(a.competency) - order(b.competency)) }))
    .sort((a, b) => a.at - b.at || (a.sourceKind === b.sourceKind ? 0 : a.sourceKind === 'lesson' ? -1 : 1));
}

/** The moment with the smallest time distance; a tie goes to the earlier one. */
export function nearestMoment(moments: readonly ChartMoment[], at: number): ChartMoment | null {
  let best: ChartMoment | null = null;
  for (const moment of moments) {
    if (best === null || Math.abs(moment.at - at) < Math.abs(best.at - at)) {
      best = moment;
    }
  }
  return best;
}

/** From all visible, the first tap isolates that competency; later taps add or remove lines. */
export function toggleCompetency(visible: readonly ProfileCompetency[], competency: ProfileCompetency): ProfileCompetency[] {
  if (visible.length === CHART_COMPETENCIES.length) {
    return [competency];
  }
  const next = visible.includes(competency) ? visible.filter((entry) => entry !== competency) : [...visible, competency];
  return CHART_COMPETENCIES.filter((entry) => next.includes(entry));
}

export function showAll(): ProfileCompetency[] {
  return [...CHART_COMPETENCIES];
}

export function rangeLabel(range: ProgressRange): string {
  return { all: 'All time', '90d': '90 days', '30d': '30 days' }[range];
}

export function chartSummary(range: ProgressRange, pointCount: number): string {
  const span = { all: 'all time', '90d': 'last 90 days', '30d': 'last 30 days' }[range];
  return `Line chart of your competency scores, ${span}, ${pointCount} ${pointCount === 1 ? 'measurement' : 'measurements'}.`;
}
