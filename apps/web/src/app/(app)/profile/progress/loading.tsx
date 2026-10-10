import { ProgressSkeleton } from '@/components/progress/progress-skeleton';

export default function ProgressLoading() {
  return (
    <main className="flex flex-col gap-lg">
      <h2 className="text-headline-sm text-on-surface">Progress</h2>
      <ProgressSkeleton />
    </main>
  );
}
