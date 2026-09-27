'use client';

import { ErrorState } from '@/components/ui';

/** An area that throws fails on its own; the header and the section tabs above it stay usable. */
export default function LessonAreaError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState title="We could not load this part of the lesson." description="Check your connection and try again." onRetry={reset} />
  );
}
