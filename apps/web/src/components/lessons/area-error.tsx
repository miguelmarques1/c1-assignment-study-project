'use client';

import { useRouter } from 'next/navigation';

import { ErrorState } from '@/components/ui';

/**
 * One area's failed read. Only that area shows it; the header and the other
 * areas stay usable, and `Try again` re-runs the server reads.
 */
export function AreaError({ title, description = 'Check your connection and try again.' }: { title: string; description?: string }) {
  const router = useRouter();
  return <ErrorState title={title} description={description} onRetry={() => router.refresh()} />;
}
