'use client';

import type { SpeakingWord } from '@english-quest/shared';

import { BAND_CLASS, BAND_LABEL } from '@/components/lessons/transcript/word-colouring';
import { cn } from '@/components/ui';

function wordLabel(word: SpeakingWord): string {
  if (word.band === null) {
    return `${word.text}: not assessed`;
  }
  const errors = word.errorTypes.length > 0 ? `, ${word.errorTypes.join(', ')}` : '';
  return `${word.text}: ${word.accuracy ?? 0} out of 100, ${BAND_LABEL[word.band]}${errors}`;
}

interface SpokenWordsProps {
  words: SpeakingWord[];
  /** Plays a `poor` word's own segment (A27) — omitted where there is no stored attempt to fetch from (none here, by design). */
  onPlayRange?: (startMs: number, durationMs: number) => void;
}

/** F19's word colouring (A26), with a `poor` word also playable as a button when its offsets are known. */
export function SpokenWords({ words, onPlayRange }: SpokenWordsProps) {
  return (
    <div className="flex flex-col gap-xs">
      <ul aria-label="Word-level pronunciation" className="flex flex-wrap gap-sm">
        {words.map((word, index) => {
          const key = `${word.text}-${index}`;
          if (word.band === null) {
            return (
              <li key={key} aria-label={wordLabel(word)} className="text-body-lg text-on-surface-variant">
                {word.text}
              </li>
            );
          }

          if (word.band === 'poor' && onPlayRange && word.startMs !== null && word.durationMs !== null) {
            const startMs = word.startMs;
            const durationMs = word.durationMs;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-label={wordLabel(word)}
                  className={cn('text-body-lg underline-offset-4', BAND_CLASS[word.band])}
                  onClick={() => onPlayRange(startMs, durationMs)}
                >
                  {word.text}
                </button>
              </li>
            );
          }

          return (
            <li key={key} aria-label={wordLabel(word)} className={cn('text-body-lg', BAND_CLASS[word.band])}>
              {word.text}
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-md text-body-sm text-on-surface-variant" aria-hidden="true">
        <span className={BAND_CLASS.good}>Good (80+)</span>
        <span className={BAND_CLASS.fair}>Fair (60–79)</span>
        <span className={BAND_CLASS.poor}>Needs work (below 60)</span>
      </p>
    </div>
  );
}
