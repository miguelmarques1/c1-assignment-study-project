import Link from 'next/link';

import { lessonHref } from '@/components/lessons/links';
import { COMPETENCY_LABELS } from '@/components/profile/competency-meters';
import { CHART_COMPETENCIES, type ChartMoment } from '@/lib/progress-chart';
import { formatShortDate } from '@/lib/relative-time';

export interface CompetencyTableProps {
  /** Every moment in the selected range, with all six competencies. */
  moments: ChartMoment[];
  serverTime: string;
}

/** The chart's accessible alternative: one row per moment, one column per competency, `—` where not measured. */
export function CompetencyTable({ moments, serverTime }: CompetencyTableProps) {
  const now = new Date(serverTime);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm text-on-surface">
        <caption className="pb-sm text-left text-label-md text-on-surface-variant">Competency scores by measurement</caption>
        <thead>
          <tr className="border-b-2 border-outline-strong">
            <th scope="col" className="p-sm text-label-md">
              Date
            </th>
            <th scope="col" className="p-sm text-label-md">
              Source
            </th>
            {CHART_COMPETENCIES.map((competency) => (
              <th key={competency} scope="col" className="p-sm text-label-md">
                {COMPETENCY_LABELS[competency]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {moments.map((moment) => {
            const date = formatShortDate(new Date(moment.measuredAt), now);
            return (
              <tr key={`${moment.measuredAt}-${moment.sourceKind}`} className="border-b-2 border-outline-variant">
                <th scope="row" className="p-sm text-body-sm font-normal">
                  {moment.sourceKind === 'lesson' && moment.lessonId ? (
                    <Link href={lessonHref(moment.lessonId)} className="text-primary underline">
                      {date}
                    </Link>
                  ) : (
                    date
                  )}
                </th>
                <td className="p-sm">{moment.sourceKind === 'lesson' ? 'Lesson' : 'Activity'}</td>
                {CHART_COMPETENCIES.map((competency) => {
                  const entry = moment.entries.find((candidate) => candidate.competency === competency);
                  return (
                    <td key={competency} className="p-sm">
                      {entry ? entry.score : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
