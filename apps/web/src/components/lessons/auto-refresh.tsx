'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const AUTO_REFRESH_INTERVAL_MS = 10_000;

/**
 * Re-renders the server components every 10 s while something the viewer
 * can see is still moving — processing, or blocked (a blocked stage resumes
 * by itself within about a minute of a key being saved). With nothing
 * pending it does nothing at all, so a settled page never polls (F19, A20).
 */
export function AutoRefresh({ active, intervalMs = AUTO_REFRESH_INTERVAL_MS }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);

  return null;
}
