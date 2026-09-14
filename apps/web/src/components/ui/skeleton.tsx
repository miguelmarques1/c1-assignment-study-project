import { cn } from './cn';

interface SkeletonProps {
  className?: string;
}

/** The shape unit LoadingState composes from — a block, never a spinner. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-md bg-surface-container-highest motion-reduce:animate-none', className)} />;
}
