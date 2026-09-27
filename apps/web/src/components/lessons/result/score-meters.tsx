import type { AnalysisCompetencyView, LessonPronunciationView } from '@english-quest/shared';

import { Meter } from '@/components/ui';

import { capitalize } from '../format';

/** What the sixth meter says when there is no pronunciation score to draw. */
export const PRONUNCIATION_ABSENT: Record<Exclude<LessonPronunciationView['status'], 'assessed'>, string> = {
  pending: 'Pronunciation is still being assessed.',
  no_sample: 'Not enough clear speech was captured to score pronunciation in this lesson.',
  failed: 'Pronunciation could not be assessed for this lesson.',
  unavailable: 'There is no pronunciation result for you in this lesson.',
};

/**
 * The six meters (F19): the five LLM competencies with their deltas and
 * justifications, then pronunciation from F10's rounded `overall`. A first
 * lesson's null delta renders as an em dash.
 */
export function ScoreMeters({
  competencies,
  pronunciation,
}: {
  competencies: AnalysisCompetencyView[];
  pronunciation: LessonPronunciationView | null;
}) {
  const overall = pronunciation?.status === 'assessed' ? pronunciation.result?.overall : undefined;

  return (
    <section aria-labelledby="scores-heading" className="flex flex-col gap-md">
      <h2 id="scores-heading" className="text-headline-sm text-on-surface">
        Your scores
      </h2>
      <ul className="grid grid-cols-1 gap-md md:grid-cols-2">
        {competencies.map((competency) => (
          <li key={competency.competency} className="flex flex-col gap-xs">
            <Meter label={capitalize(competency.competency)} value={competency.score} delta={competency.delta} />
            <p className="text-body-sm text-on-surface-variant">{competency.justification}</p>
          </li>
        ))}
        <li className="flex flex-col gap-xs">
          {overall ? (
            <Meter label="Pronunciation" value={overall.score} delta={overall.delta} />
          ) : (
            <>
              <span className="text-label-md text-on-surface-variant">Pronunciation</span>
              <p className="text-body-sm text-on-surface-variant">
                {pronunciation && pronunciation.status !== 'assessed'
                  ? PRONUNCIATION_ABSENT[pronunciation.status]
                  : 'Your pronunciation result could not be loaded.'}
              </p>
            </>
          )}
        </li>
      </ul>
    </section>
  );
}
