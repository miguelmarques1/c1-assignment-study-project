import { Skeleton } from '@/components/ui';

/** Shaped like the task card and the recorder below it, so the layout doesn't jump once the activity loads. */
export default function SpeakingLoading() {
  return (
    <main className="flex flex-col gap-md">
      <Skeleton className="h-lg w-64" />
      <div role="status" aria-live="polite" className="flex flex-col gap-lg">
        <span className="sr-only">Loading this activity</span>
        <div className="flex flex-col gap-sm rounded-lg border-2 border-outline-strong p-lg">
          <Skeleton className="h-md w-full" />
          <Skeleton className="h-md w-5/6" />
          <Skeleton className="h-md w-3/4" />
        </div>
        <div className="flex flex-col items-center gap-md">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-lg w-32" />
          <Skeleton className="h-xl w-full rounded-md" />
        </div>
      </div>
    </main>
  );
}
