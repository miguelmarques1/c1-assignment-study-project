'use client';

import type { ProfileCompetency, ProgressDashboardView, ProgressRange } from '@english-quest/shared';
import { useId, useMemo, useState } from 'react';

import { Button, Card, SegmentedControl } from '@/components/ui';
import {
  chartDomain,
  chartSummary,
  countPoints,
  momentsOf,
  rangeLabel,
  seriesInRange,
  showAll,
  toggleCompetency,
  CHART_COMPETENCIES,
} from '@/lib/progress-chart';
import { CompetencyChart } from './competency-chart';
import { CompetencyLegend } from './competency-legend';
import { CompetencyTable } from './competency-table';
import { MarkerGlyph } from './series-key';

const RANGES: ProgressRange[] = ['all', '90d', '30d'];
const RANGE_OPTIONS = RANGES.map((range) => ({ value: range, label: rangeLabel(range) }));

function ChartEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-xs rounded-md border-2 border-dashed border-outline-variant p-lg text-center">
      <p className="text-title-md text-on-surface">{title}</p>
      {hint ? <p className="text-body-md text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

export interface CompetencyChartCardProps {
  view: ProgressDashboardView;
}

/**
 * The chart card (F20): range selector, plot (or the explanatory empty
 * state), source key, the legend that doubles as the snapshot, and the
 * table alternative. It owns the selected range and the visible set; the
 * server decides the data and the range boundaries.
 */
export function CompetencyChartCard({ view }: CompetencyChartCardProps) {
  const { competencyHistory, profile, serverTime } = view;
  const [range, setRange] = useState<ProgressRange>('all');
  const [visible, setVisible] = useState<ProfileCompetency[]>(showAll);
  const [tableOpen, setTableOpen] = useState(false);
  const tableId = useId();

  const since = competencyHistory.ranges.find((boundary) => boundary.range === range)?.since ?? null;
  const inRange = useMemo(() => seriesInRange(competencyHistory.series, since), [competencyHistory.series, since]);
  const domain = useMemo(() => chartDomain(inRange, since, serverTime), [inRange, since, serverTime]);
  const allMoments = useMemo(() => momentsOf(inRange, CHART_COMPETENCIES), [inRange]);
  const warmingUp = useMemo(
    () => Object.fromEntries(profile.competencies.map((entry) => [entry.competency, entry.warmingUp])) as Record<ProfileCompetency, boolean>,
    [profile.competencies],
  );
  const everyLineShown = visible.length === CHART_COMPETENCIES.length;

  let plot;
  if (!competencyHistory.chartable) {
    plot = <ChartEmpty title="Not enough data yet — complete 3 lessons to see trends." />;
  } else if (!domain) {
    plot = (
      <ChartEmpty title={`No measurements in the last ${rangeLabel(range)}.`} hint="Choose a longer range to see earlier ones." />
    );
  } else if (visible.length === 0) {
    plot = <ChartEmpty title="Every line is hidden. Choose a competency below, or show all." />;
  } else {
    plot = (
      <CompetencyChart
        series={inRange}
        visible={visible}
        domain={domain}
        warmingUp={warmingUp}
        summary={chartSummary(range, countPoints(inRange))}
        serverTime={serverTime}
      />
    );
  }

  return (
    <Card
      header={
        <div className="flex flex-col gap-xs">
          <h3 className="text-title-lg text-on-surface">Competencies over time</h3>
          <p className="text-body-md text-on-surface-variant">
            Each point is your smoothed score after a lesson or an activity — up to your last {competencyHistory.pointsPerCompetency} per
            competency.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-md">
        <SegmentedControl label="Time range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
        {plot}
        <ul className="flex flex-wrap items-center gap-md text-body-sm text-on-surface-variant" aria-label="Source key">
          <li className="flex items-center gap-xs">
            <MarkerGlyph shape="circle" />
            Lesson
          </li>
          <li className="flex items-center gap-xs">
            <MarkerGlyph shape="diamond" />
            Activity
          </li>
        </ul>
        <CompetencyLegend
          competencies={profile.competencies}
          visible={visible}
          onToggle={(competency) => setVisible((current) => toggleCompetency(current, competency))}
        />
        <div className="flex flex-wrap items-center gap-sm">
          <p className="text-body-sm text-on-surface-variant">Select a competency to show only its line.</p>
          {everyLineShown ? null : (
            <Button variant="neutral" size="sm" onClick={() => setVisible(showAll())}>
              Show all
            </Button>
          )}
        </div>
        {competencyHistory.chartable && domain ? (
          <div className="flex flex-col gap-sm">
            <Button
              variant="neutral"
              size="sm"
              className="self-start"
              aria-expanded={tableOpen}
              aria-controls={tableId}
              onClick={() => setTableOpen((current) => !current)}
            >
              {tableOpen ? 'Hide table' : 'Show as table'}
            </Button>
            {tableOpen ? (
              <div id={tableId}>
                <CompetencyTable moments={allMoments} serverTime={serverTime} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
