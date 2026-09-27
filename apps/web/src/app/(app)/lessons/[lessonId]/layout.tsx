import type { ReactNode } from 'react';

import { AreaError } from '@/components/lessons/area-error';
import { AutoRefresh } from '@/components/lessons/auto-refresh';
import { LessonHeader, LessonUnavailable } from '@/components/lessons/lesson-header';
import { lessonHref } from '@/components/lessons/links';
import { NavPill } from '@/components/ui';
import { getLessonDetail } from '@/lib/lessons-server';

export const metadata = {
  title: 'Lesson · English Quest',
};

/**
 * The lesson detail's frame: the header every area shares, the four areas
 * as sub-routes (so each has a deep link, and the transcript an anchor per
 * line), and a refresh while the caller's own processing is still moving.
 */
export default async function LessonLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const detail = await getLessonDetail(lessonId);

  if (!detail.ok) {
    if (detail.code === 'CLASS004' || detail.code === 'VAL001') {
      return <LessonUnavailable />;
    }
    return (
      <main className="flex flex-col gap-md">
        <AreaError title="We could not load this lesson." />
      </main>
    );
  }

  const lesson = detail.data;
  return (
    <main className="flex flex-col gap-lg">
      <AutoRefresh active={lesson.status === 'processing' || lesson.status === 'blocked'} />
      <LessonHeader lesson={lesson} />
      <NavPill
        label="Lesson sections"
        alwaysVisible
        destinations={[
          { href: lessonHref(lessonId), label: 'Result' },
          { href: lessonHref(lessonId, 'scenario'), label: 'Scenario' },
          { href: lessonHref(lessonId, 'transcript'), label: 'Transcript' },
          { href: lessonHref(lessonId, 'status'), label: 'Status' },
        ]}
      />
      {children}
    </main>
  );
}
