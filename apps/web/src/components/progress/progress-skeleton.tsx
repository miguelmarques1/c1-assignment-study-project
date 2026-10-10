import { Card, Skeleton } from '@/components/ui';

/** Shaped like what is coming: the chart card (a plot block and six tiles), then two weakness rows. */
export function ProgressSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-lg">
      <span className="sr-only">Loading your progress…</span>
      <Card>
        <div className="flex flex-col gap-md">
          <Skeleton className="h-lg w-1/3" />
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-2 gap-sm md:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-sm">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    </div>
  );
}
