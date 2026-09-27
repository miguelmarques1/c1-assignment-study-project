'use client';

import type { LessonList as LessonListView, LessonSummary } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, EmptyState } from '@/components/ui';
import { fetchLessonPage } from '@/lib/lessons';

import { AutoRefresh } from './auto-refresh';
import { formatBytes } from './format';
import { LessonRow } from './lesson-row';

/** Whether anything listed is still moving, so the page keeps refreshing. */
export function hasPendingLesson(lessons: LessonSummary[]): boolean {
  return lessons.some((lesson) => lesson.status === 'processing' || lesson.status === 'blocked');
}

export function LessonsEmpty() {
  const router = useRouter();
  return (
    <EmptyState
      title="No lessons yet"
      description="A lesson appears here as soon as it ends."
      action={{ label: 'Open classroom', onClick: () => router.push('/classroom') }}
    />
  );
}

/**
 * The history: the first page arrives from the server component, and
 * `Load more` appends the next through the cursor. A refresh replaces the
 * first page with fresh rows and keeps whatever was loaded after it.
 */
export function LessonList({ initial }: { initial: LessonListView }) {
  const [more, setMore] = useState<LessonSummary[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const firstIds = new Set(initial.lessons.map((lesson) => lesson.lessonId));
  const lessons = [...initial.lessons, ...more.filter((lesson) => !firstIds.has(lesson.lessonId))];
  const nextCursor = moreCursor === undefined ? initial.nextCursor : moreCursor;

  async function loadMore(cursor: string) {
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchLessonPage(cursor);
      setMore((current) => [...current, ...page.lessons]);
      setMoreCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (lessons.length === 0) {
    return <LessonsEmpty />;
  }

  return (
    <div className="flex flex-col gap-md">
      <AutoRefresh active={hasPendingLesson(lessons)} />
      <p className="text-body-sm text-on-surface-variant">
        Recordings use {formatBytes(initial.totalStorageBytes)} of storage.
      </p>
      <ul aria-label="Your lessons" className="flex flex-col gap-sm">
        {lessons.map((lesson) => (
          <LessonRow key={lesson.lessonId} lesson={lesson} />
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="text-body-sm text-error">
          We could not load more lessons. Try again.
        </p>
      ) : null}
      {nextCursor ? (
        <Button variant="neutral" onClick={() => void loadMore(nextCursor)} loading={loading} loadingLabel="Loading…">
          Load more
        </Button>
      ) : null}
    </div>
  );
}
