import { AreaError } from '@/components/lessons/area-error';
import { LessonList } from '@/components/lessons/lesson-list';
import { getLessonList } from '@/lib/lessons-server';

export const metadata = {
  title: 'Lessons · English Quest',
};

/** Every lesson the viewer took part in, newest first, each with their own status (F19). */
export default async function LessonsPage() {
  const result = await getLessonList();

  return (
    <main className="flex flex-col gap-md">
      <h1 className="text-headline-md text-on-surface">Lessons</h1>
      {result.ok ? <LessonList initial={result.data} /> : <AreaError title="We could not load your lessons." />}
    </main>
  );
}
