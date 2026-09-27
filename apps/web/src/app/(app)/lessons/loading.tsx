import { LoadingState } from '@/components/ui';

export default function LessonsLoading() {
  return (
    <main className="flex flex-col gap-md">
      <h1 className="text-headline-md text-on-surface">Lessons</h1>
      <LoadingState variant="list" label="Loading your lessons" />
    </main>
  );
}
