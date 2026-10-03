import type { WritingErrorGroupView, WritingErrorView } from '@english-quest/shared';
import Link from 'next/link';

import { Badge, Chip, EmptyState } from '@/components/ui';

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

export interface WritingErrorGroupsProps {
  groups: WritingErrorGroupView[];
  errors: WritingErrorView[];
}

/** Errors grouped by tag, with a recurrence badge where the tag is already in the ledger (spec §4). */
export function WritingErrorGroups({ groups, errors }: WritingErrorGroupsProps) {
  if (groups.length === 0) {
    return <EmptyState title="No errors found in this text." description="Nothing to review this time." />;
  }

  return (
    <div className="flex flex-col gap-lg">
      {groups.map((group) => {
        const groupErrors = group.errorIndexes.map((index) => errors[index]!);
        return (
          <section key={group.tag} className="flex flex-col gap-sm">
            <div className="flex flex-wrap items-center gap-sm">
              <Link href={`/profile?tag=${encodeURIComponent(group.tag)}`}>
                <Chip tone="accent">{group.tagLabel}</Chip>
              </Link>
              {group.recurrence ? <Badge status="warning">{group.recurrence.label}</Badge> : null}
              <span className="text-label-sm text-on-surface-variant">
                {groupErrors.length} {groupErrors.length === 1 ? 'error' : 'errors'}
              </span>
            </div>
            <ul className="flex flex-col gap-sm">
              {groupErrors.map((error) => (
                <li key={error.index} className="flex flex-col gap-xs rounded-md border-2 border-outline-strong bg-surface p-md">
                  <p className="text-body-md text-on-surface">“{error.quote}”</p>
                  <p className="text-body-sm text-on-surface-variant">
                    Correction: <CorrectionWords segments={error.correctionSegments} />
                  </p>
                  <p className="text-body-sm text-on-surface-variant">{error.explanation}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
