'use client';

import type { LessonList } from '@english-quest/shared';
import Link from 'next/link';

import { AreaError } from '@/components/lessons/area-error';
import { AutoRefresh } from '@/components/lessons/auto-refresh';
import { hasPendingLesson, LessonsEmpty } from '@/components/lessons/lesson-list';
import { LessonRow } from '@/components/lessons/lesson-row';
import { ArrowRightIcon } from '@/components/ui';
import type { ServerRead } from '@/lib/lessons-server';

export const RECENT_LESSONS_COUNT = 3;

/**
 * The dashboard's newest lessons. Not in the dashboard mockup: F05 and F07
 * promise that an ended lesson "appears immediately with a Processing
 * status" on the dashboard, and this is where it does (see design/README.md).
 */
export function RecentLessons({ result }: { result: ServerRead<LessonList> }) {
  const lessons = result.ok ? result.data.lessons.slice(0, RECENT_LESSONS_COUNT) : [];

  return (
    <section aria-labelledby="recent-lessons-heading" className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h2 id="recent-lessons-heading" className="text-headline-sm text-on-surface">
          Recent lessons
        </h2>
        {lessons.length > 0 ? (
          <Link
            href="/lessons"
            className="inline-flex items-center gap-xs text-label-lg text-primary underline-offset-4 hover:underline"
          >
            See all lessons
            <ArrowRightIcon size={16} />
          </Link>
        ) : null}
      </div>
      {!result.ok ? (
        <AreaError title="We could not load your lessons." />
      ) : lessons.length === 0 ? (
        <LessonsEmpty />
      ) : (
        <>
          <AutoRefresh active={hasPendingLesson(lessons)} />
          <ul aria-label="Recent lessons" className="flex flex-col gap-sm">
            {lessons.map((lesson) => (
              <LessonRow key={lesson.lessonId} lesson={lesson} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
