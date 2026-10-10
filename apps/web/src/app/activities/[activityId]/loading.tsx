import { Skeleton } from '@/components/ui';

/** Shaped like the top bar, the passage and the question card, so the layout does not jump once the activity loads. */
export default function ActivityLoading() {
  return (
    <main className="flex flex-col gap-lg">
      <div role="status" aria-live="polite" className="flex flex-col gap-lg">
        <span className="sr-only">Loading this activity</span>
        <div className="flex items-center gap-md rounded-lg border-2 border-outline-strong p-md">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-md w-64" />
          <Skeleton className="h-sm flex-1" />
        </div>
        <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <div className="flex flex-col gap-sm rounded-lg border-2 border-outline-strong p-lg">
            <Skeleton className="h-md w-full" />
            <Skeleton className="h-md w-5/6" />
            <Skeleton className="h-md w-3/4" />
          </div>
          <div className="flex flex-col gap-md rounded-lg border-2 border-outline-strong p-lg">
            <Skeleton className="h-md w-32" />
            <Skeleton className="h-xl w-full rounded-md" />
            <Skeleton className="h-xl w-full rounded-md" />
          </div>
        </div>
      </div>
    </main>
  );
}
