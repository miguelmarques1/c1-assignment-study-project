import type { LessonSummary } from '@english-quest/shared';
import Link from 'next/link';

import { Chip, TimerIcon, UsersIcon } from '@/components/ui';

import { formatBytes, formatDuration, formatParticipants } from './format';
import { LessonStatusBadge } from './lesson-status-badge';
import { LocalizedTime } from './localized-time';

/** The detail's header, the same on every area: when, how long, who, the domain, the caller's status and storage. */
export function LessonHeader({ lesson }: { lesson: LessonSummary }) {
  return (
    <header className="flex flex-col gap-sm">
      <Link href="/lessons" className="text-label-md text-primary underline-offset-4 hover:underline">
        ← All lessons
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <h1 className="text-headline-md text-on-surface">{lesson.scenarioTitle ?? 'Conversation lesson'}</h1>
        <LessonStatusBadge status={lesson.status} flags={lesson.flags} />
      </div>
      <p className="flex flex-wrap items-center gap-sm text-body-md text-on-surface-variant">
        <span>
          <LocalizedTime iso={lesson.startedAt} format="absolute" /> (<LocalizedTime iso={lesson.startedAt} format="relative" />)
        </span>
        <span className="inline-flex items-center gap-xs">
          <TimerIcon size={16} />
          {formatDuration(lesson.durationSeconds)}
        </span>
        <span className="inline-flex items-center gap-xs">
          <UsersIcon size={16} />
          {formatParticipants(lesson.participants)}
        </span>
        {lesson.vocabularyDomain ? <Chip>{lesson.vocabularyDomain}</Chip> : null}
        <span className="text-body-sm">Recordings: {formatBytes(lesson.storageBytes)}</span>
      </p>
    </header>
  );
}

/** A lesson the caller did not take part in, or one with no history entry (`CLASS004`). */
export function LessonUnavailable() {
  return (
    <main className="flex flex-col items-center gap-sm p-xl text-center">
      <p className="text-title-md text-on-surface">This lesson isn&apos;t available to you.</p>
      <Link
        href="/lessons"
        className="press-button inline-flex items-center rounded-md border-2 border-outline-strong bg-surface-container-lowest px-md py-sm text-label-lg text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        Back to lessons
      </Link>
    </main>
  );
}
