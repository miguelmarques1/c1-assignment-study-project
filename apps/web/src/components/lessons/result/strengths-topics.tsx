import type { LessonAnalysisResult } from '@english-quest/shared';

import { Chip } from '@/components/ui';

function ListSection({ id, title, items }: { id: string; title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={id} className="flex flex-col gap-sm">
      <h2 id={id} className="text-headline-sm text-on-surface">
        {title}
      </h2>
      <ul className="flex list-disc flex-col gap-xs pl-lg text-body-md text-on-surface">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

/** The analysis's notes, then strengths. */
export function NotesAndStrengths({ analysis }: { analysis: LessonAnalysisResult }) {
  return (
    <>
      {analysis.notes.length > 0 ? (
        <ul aria-label="Notes" className="flex flex-col gap-xs">
          {analysis.notes.map((note) => (
            <li key={note} className="rounded-md border-2 border-outline-strong bg-badge-info-bg p-sm text-body-sm text-badge-info-fg">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      <ListSection id="strengths-heading" title="Strengths" items={analysis.strengths} />
    </>
  );
}

/**
 * Recurring tags (labelled from the errors that carry them) and topics to
 * practice. A recurring tag no error explains keeps its raw id rather than
 * inventing a label.
 */
export function RecurringAndTopics({ analysis }: { analysis: LessonAnalysisResult }) {
  const labelOf = new Map(analysis.errors.map((error) => [error.tag, error.tagLabel]));

  return (
    <>
      {analysis.recurringTags.length > 0 ? (
        <section aria-labelledby="recurring-heading" className="flex flex-col gap-sm">
          <h2 id="recurring-heading" className="text-headline-sm text-on-surface">
            Recurring
          </h2>
          <ul className="flex flex-wrap gap-sm">
            {analysis.recurringTags.map((tag) => (
              <li key={tag}>
                <Chip tone="warning">{labelOf.get(tag) ?? tag}</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ListSection id="topics-heading" title="Topics to practice" items={analysis.topicsToPractice} />
    </>
  );
}
