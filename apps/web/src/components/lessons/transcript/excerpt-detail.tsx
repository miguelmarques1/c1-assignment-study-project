import type { TranscriptExcerpt } from '@english-quest/shared';

import { WordColouring } from './word-colouring';

const SCORE_ROWS = [
  { key: 'pronunciation', label: 'Pronunciation' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'prosody', label: 'Prosody' },
  { key: 'completeness', label: 'Completeness' },
] as const;

/** The expanded badge: word colouring, why this line was chosen, and its five scores. */
export function ExcerptDetail({ excerpt, id }: { excerpt: TranscriptExcerpt; id: string }) {
  const scores = excerpt.pronunciation.scores;

  return (
    <div id={id} className="flex flex-col gap-sm rounded-md border-2 border-outline-strong bg-surface-container p-md">
      {excerpt.assessedWords && excerpt.assessedWords.length > 0 ? <WordColouring words={excerpt.assessedWords} /> : null}
      <p className="text-body-sm text-on-surface-variant">{excerpt.reason}</p>
      {scores ? (
        <dl className="grid grid-cols-2 gap-xs sm:grid-cols-5">
          {SCORE_ROWS.map(({ key, label }) => (
            <div key={key} className="flex flex-col">
              <dt className="text-label-sm text-on-surface-variant">{label}</dt>
              <dd className="text-label-lg text-on-surface">
                {scores[key] === null ? 'Not measured' : Math.round(scores[key])}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-body-sm text-on-surface-variant">
          {excerpt.pronunciation.status === 'pending'
            ? 'This excerpt has not been assessed yet.'
            : 'This excerpt could not be assessed.'}
        </p>
      )}
    </div>
  );
}
