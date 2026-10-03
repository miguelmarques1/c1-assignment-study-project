import type { WritingRevisionSegment } from '@english-quest/shared';

export interface RevisedTextProps {
  segments: WritingRevisionSegment[];
}

/**
 * The revised text as continuous prose, with changed spans emphasized
 * (spec §4). Unlike a correction's word-level segments, these concatenate
 * back to the revised text exactly — no space is inserted between them.
 */
export function RevisedText({ segments }: RevisedTextProps) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="whitespace-pre-line text-body-md text-on-surface">
        {segments.map((segment, index) => (
          <span key={index} className={segment.changed ? 'font-bold text-primary underline' : undefined}>
            {segment.text}
          </span>
        ))}
      </p>
      <p className="sr-only">Bold, underlined text marks what changed from your original submission.</p>
    </div>
  );
}
