'use client';

import { WRITING_EXPECTED_WORDS, WRITING_MAX_SUBMIT_WORDS, WRITING_MIN_SUBMIT_WORDS } from '@english-quest/shared';
import { useEffect, useRef, useState } from 'react';

import { CheckCircleIcon, cn } from '@/components/ui';

export interface WordCounterProps {
  count: number;
}

type Band = 'below' | 'ok' | 'too_long';

function bandOf(count: number): Band {
  if (count < WRITING_MIN_SUBMIT_WORDS) return 'below';
  if (count > WRITING_MAX_SUBMIT_WORDS) return 'too_long';
  return 'ok';
}

function announcementFor(band: Band, count: number): string {
  if (band === 'below') return `${count} of ${WRITING_MIN_SUBMIT_WORDS} words`;
  if (band === 'too_long') return 'Too long to correct: keep it under 600 words.';
  return `${count} words, ready to submit`;
}

/**
 * The live word counter (spec §4): grey below the 80-word minimum, tertiary
 * with a check once it is met, a neutral hint past the expected upper
 * bound, and an error past the hard maximum. A visually hidden region
 * announces only threshold crossings, not every keystroke.
 */
export function WordCounter({ count }: WordCounterProps) {
  const band = bandOf(count);
  const lastAnnouncedBand = useRef<Band | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (lastAnnouncedBand.current !== band) {
      lastAnnouncedBand.current = band;
      setAnnouncement(announcementFor(band, count));
    }
  }, [band, count]);

  return (
    <div className="flex flex-col gap-xs">
      <span
        className={cn(
          'inline-flex items-center gap-xs text-label-md',
          band === 'below' && 'text-on-surface-variant',
          band === 'ok' && 'text-tertiary',
          band === 'too_long' && 'text-error',
        )}
      >
        {band === 'below' ? `${count} of ${WRITING_MIN_SUBMIT_WORDS} words` : `${count} words`}
        {band === 'ok' ? <CheckCircleIcon size={16} /> : null}
      </span>
      {band === 'ok' && count > WRITING_EXPECTED_WORDS.max ? (
        <span className="text-body-sm text-on-surface-variant">Aim for 120–250 words.</span>
      ) : null}
      {band === 'too_long' ? (
        <span className="text-body-sm text-error">Too long to correct: keep it under 600 words.</span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
