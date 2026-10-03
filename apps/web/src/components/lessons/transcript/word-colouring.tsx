import type { AssessedWord, PronunciationWordBand } from '@english-quest/shared';

import { cn } from '@/components/ui';

/**
 * Colour is always paired with a non-colour cue (F21): a solid underline
 * for `poor`, a dotted one for `fair`, none for `good` — and every word
 * carries its score and error types in its accessible label (F19, A16).
 */
export const BAND_CLASS: Record<PronunciationWordBand, string> = {
  good: 'text-tertiary',
  fair: 'text-badge-warning-fg underline decoration-dotted decoration-2 underline-offset-4',
  poor: 'text-error underline decoration-solid decoration-2 underline-offset-4',
};

export const BAND_LABEL: Record<PronunciationWordBand, string> = {
  good: 'good',
  fair: 'fair',
  poor: 'needs work',
};

export function wordLabel(word: AssessedWord): string {
  const errors = word.errorTypes.length > 0 ? `, ${word.errorTypes.join(', ')}` : '';
  return `${word.text}: ${word.accuracy} out of 100, ${BAND_LABEL[word.band]}${errors}`;
}

export function WordColouring({ words }: { words: AssessedWord[] }) {
  return (
    <div className="flex flex-col gap-xs">
      <ul aria-label="Word-level pronunciation" className="flex flex-wrap gap-sm">
        {words.map((word, index) => (
          <li key={`${word.text}-${index}`} aria-label={wordLabel(word)} data-band={word.band} className={cn('text-body-lg', BAND_CLASS[word.band])}>
            {word.text}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-md text-body-sm text-on-surface-variant" aria-hidden="true">
        <span className={BAND_CLASS.good}>Good (80+)</span>
        <span className={BAND_CLASS.fair}>Fair (60–79)</span>
        <span className={BAND_CLASS.poor}>Needs work (below 60)</span>
      </p>
    </div>
  );
}
