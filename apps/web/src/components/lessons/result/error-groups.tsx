import type { AnalysisErrorView, ErrorSeverity } from '@english-quest/shared';

import { ErrorCard } from './error-card';

const GROUPS: Array<{ severity: ErrorSeverity; title: string }> = [
  { severity: 'major', title: 'Major' },
  { severity: 'moderate', title: 'Moderate' },
  { severity: 'minor', title: 'Minor' },
];

/** Errors grouped Major → Moderate → Minor, empty groups left out. */
export function ErrorGroups({ errors, lessonId }: { errors: AnalysisErrorView[]; lessonId: string }) {
  return (
    <section aria-labelledby="errors-heading" className="flex flex-col gap-md">
      <h2 id="errors-heading" className="text-headline-sm text-on-surface">
        Errors to work on
      </h2>
      {errors.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No errors were found in this lesson.</p>
      ) : (
        GROUPS.map(({ severity, title }) => {
          const group = errors.filter((error) => error.severity === severity);
          if (group.length === 0) {
            return null;
          }
          return (
            <div key={severity} className="flex flex-col gap-sm">
              <h3 className="text-title-md text-on-surface">
                {title} <span className="text-on-surface-variant">({group.length})</span>
              </h3>
              <ul aria-label={`${title} errors`} className="flex flex-col gap-sm">
                {group.map((error, index) => (
                  <ErrorCard key={`${error.tag}-${index}`} error={error} lessonId={lessonId} />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
