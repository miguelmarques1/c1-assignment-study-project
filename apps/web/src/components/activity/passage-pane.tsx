import type { ObjectiveItemView } from '@english-quest/shared';

export interface PassagePaneProps {
  passage: NonNullable<ObjectiveItemView['passage']>;
  /** Shown under the text, after a submission only. */
  source?: ObjectiveItemView['source'];
}

/**
 * The text (or, after a listening submission, the transcript) in its own
 * independently scrolling region, so it stays readable while the questions
 * are answered (A23). Focusable so a keyboard user can scroll it.
 */
export function PassagePane({ passage, source }: PassagePaneProps) {
  const heading = passage.kind === 'transcript' ? 'Transcript' : 'Text';
  return (
    <section className="flex flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card">
      <h2 className="text-label-lg text-on-surface-variant">{heading}</h2>
      <div
        role="region"
        aria-label={heading}
        // A scrollable region has to be focusable, or a keyboard user cannot scroll the text (WCAG 2.1.1).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="max-h-96 overflow-y-auto whitespace-pre-line pr-sm text-body-lg text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        {passage.text}
      </div>
      {source ? (
        <p className="text-body-sm text-on-surface-variant">
          Source:{' '}
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </p>
      ) : null}
    </section>
  );
}
