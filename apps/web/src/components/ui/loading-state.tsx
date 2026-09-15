import type { ReactNode } from 'react';

import { Skeleton } from './skeleton';

export type LoadingVariant = 'card-grid' | 'list' | 'text-block' | 'meter';

function CardGridSkeleton(): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-md md:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function ListSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-sm">
      <Skeleton className="h-md w-full" />
      <Skeleton className="h-md w-full" />
      <Skeleton className="h-md w-full" />
      <Skeleton className="h-md w-full" />
    </div>
  );
}

function TextBlockSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-xs">
      <Skeleton className="h-md w-3/4" />
      <Skeleton className="h-md w-full" />
      <Skeleton className="h-md w-5/6" />
    </div>
  );
}

function MeterSkeleton(): ReactNode {
  return <Skeleton className="h-sm w-full rounded-full" />;
}

const SHAPES: Record<LoadingVariant, () => ReactNode> = {
  'card-grid': CardGridSkeleton,
  list: ListSkeleton,
  'text-block': TextBlockSkeleton,
  meter: MeterSkeleton,
};

interface LoadingStateProps {
  /** The shape of the content that is coming, not a generic spinner. */
  variant: LoadingVariant;
  label: string;
}

export function LoadingState({ variant, label }: LoadingStateProps) {
  const Shape = SHAPES[variant];
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Shape />
    </div>
  );
}
