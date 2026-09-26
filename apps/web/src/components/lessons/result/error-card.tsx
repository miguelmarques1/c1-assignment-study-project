import type { AnalysisErrorView } from '@english-quest/shared';
import Link from 'next/link';

import { Badge, Chip } from '@/components/ui';

import { transcriptHref } from '../links';

/**
 * One tagged error: the quote in quotation marks, the correction with the
 * span it changed emphasized (server-built, so web and mobile emphasize the
 * same words), the explanation, the tag, the ledger's recurrence badge and
 * a link to the moment in the transcript. The tag chip stays plain text
 * until F12's ledger detail exists to open (F19, A14).
 */
export function ErrorCard({ error, lessonId }: { error: AnalysisErrorView; lessonId: string }) {
  return (
    <li className="flex flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md shadow-card">
      <p className="text-body-lg text-on-surface-variant">
        <span className="sr-only">You said: </span>“{error.quote}”
      </p>
      <p className="text-body-lg text-on-surface">
        <span className="sr-only">Correction: </span>
        {error.correctionSegments.map((segment, index) => (
          <span key={index}>
            {index > 0 ? ' ' : null}
            {segment.changed ? (
              <strong className="font-bold text-primary underline decoration-2 underline-offset-4">{segment.text}</strong>
            ) : (
              segment.text
            )}
          </span>
        ))}
      </p>
      <p className="text-body-md text-on-surface">{error.explanation}</p>
      <div className="flex flex-wrap items-center gap-sm">
        <Chip>{error.tagLabel}</Chip>
        {error.recurrence ? <Badge status="warning">{error.recurrence.label}</Badge> : null}
        {error.utteranceId ? (
          <Link
            href={transcriptHref(lessonId, error.utteranceId)}
            className="text-label-md text-primary underline-offset-4 hover:underline"
          >
            See in transcript
          </Link>
        ) : null}
      </div>
    </li>
  );
}
