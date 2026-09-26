'use client';

import type { TranscriptUtterance } from '@english-quest/shared';
import { useState } from 'react';

import { cn } from '@/components/ui';

import { excerptScoreText, formatClock } from '../format';
import { utteranceAnchor } from '../links';
import { ExcerptDetail } from './excerpt-detail';

/**
 * One line of the conversation: its clock in the margin, the speaker, the
 * text, and — on the caller's own selected lines only — the score badge
 * that expands to the word-level detail.
 */
export function UtteranceRow({
  utterance,
  speaker,
  mine,
  highlighted,
}: {
  utterance: TranscriptUtterance;
  speaker: string;
  mine: boolean;
  highlighted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = utteranceAnchor(utterance.id);
  const detailId = `${anchor}-detail`;

  return (
    <li
      id={anchor}
      data-highlighted={highlighted || undefined}
      className={cn(
        'flex gap-md rounded-md border-2 p-sm',
        highlighted ? 'border-outline-strong bg-primary-container' : 'border-surface-container-lowest',
      )}
    >
      <span className="w-16 shrink-0 pt-xs text-label-sm tabular-nums text-on-surface-variant">
        {formatClock(utterance.startMs)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
        <span className={cn('text-label-md', mine ? 'text-primary' : 'text-on-surface-variant')}>{speaker}</span>
        <p className="text-body-md text-on-surface">{utterance.text}</p>
        {utterance.excerpt ? (
          <div className="flex flex-col gap-xs">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={() => setOpen((current) => !current)}
              className="press-button inline-flex w-fit items-center gap-xs rounded-full border-2 border-outline-strong bg-badge-info-bg px-sm py-xs text-label-sm text-badge-info-fg outline-offset-2 outline-outline-strong focus-visible:outline-2"
            >
              <span className="sr-only">Pronunciation score </span>
              <span data-score>{excerptScoreText(utterance.excerpt.pronunciation)}</span>
            </button>
            {open ? <ExcerptDetail excerpt={utterance.excerpt} id={detailId} /> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
