'use client';

import type { WritingErrorView, WritingHighlightSegment } from '@english-quest/shared';
import { useEffect, useRef, useState } from 'react';

import { Chip } from '@/components/ui';

export interface HighlightedTextProps {
  segments: WritingHighlightSegment[];
  errors: WritingErrorView[];
}

/** `correctionSegments` are word-level spans meant to be joined with single spaces, never concatenated directly. */
function CorrectionWords({ segments }: { segments: WritingErrorView['correctionSegments'] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <span key={index}>
          {index > 0 ? ' ' : ''}
          <span className={segment.changed ? 'font-bold text-primary underline' : undefined}>{segment.text}</span>
        </span>
      ))}
    </>
  );
}

/**
 * The submitted text with inline error highlights (spec §4). A highlighted
 * segment opens a popover on click, Enter or hover, naming the tag, the
 * correction with its changed words emphasized, and the explanation.
 * Escape or a click outside closes it.
 */
export function HighlightedText({ segments, errors }: HighlightedTextProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpenIndex(null);
      }
    }
    function onPointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenIndex(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="whitespace-pre-line text-body-md text-on-surface">
      {segments.map((segment, index) => {
        if (segment.errorIndexes.length === 0) {
          return <span key={index}>{segment.text}</span>;
        }
        const segmentErrors = segment.errorIndexes.map((errorIndex) => errors[errorIndex]!);
        const open = openIndex === index;
        return (
          <span key={index} className="relative inline">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${segment.text} — ${segmentErrors.map((error) => error.tagLabel).join(', ')}`}
              onClick={() => setOpenIndex(index)}
              onMouseEnter={() => setOpenIndex(index)}
              className="rounded-sm bg-badge-danger-bg text-badge-danger-fg underline decoration-2 underline-offset-2"
            >
              {segment.text}
            </button>
            {open ? (
              <span
                role="dialog"
                aria-label={segmentErrors.map((error) => error.tagLabel).join(', ')}
                className="absolute top-full left-0 z-10 mt-xs flex w-72 flex-col gap-sm rounded-md border-2 border-outline-strong bg-surface-container-lowest p-md text-left shadow-modal"
              >
                {segmentErrors.map((error) => (
                  <div key={error.index} className="flex flex-col gap-xs">
                    <Chip tone="accent">{error.tagLabel}</Chip>
                    <p className="text-body-sm text-on-surface">
                      <CorrectionWords segments={error.correctionSegments} />
                    </p>
                    <p className="text-body-sm text-on-surface-variant">{error.explanation}</p>
                  </div>
                ))}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
