'use client';

import { ErrorState } from '@/components/ui';

/** Anything the lesson pages throw lands here rather than on a blank screen. */
export default function LessonsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-col gap-md">
      <ErrorState title="We could not load your lessons." description="Check your connection and try again." onRetry={reset} />
    </main>
  );
}
