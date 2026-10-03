'use client';

import { ErrorState } from '@/components/ui';

/** Anything the speaking page throws lands here rather than on a blank screen. */
export default function SpeakingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-col gap-md">
      <ErrorState title="We could not load this activity." description="Check your connection and try again." onRetry={reset} />
    </main>
  );
}
