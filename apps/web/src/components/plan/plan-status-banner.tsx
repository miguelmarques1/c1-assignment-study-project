'use client';

import type { PlanFailure, PlanPreparing } from '@english-quest/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Card } from '@/components/ui';
import { retryPlan } from '@/lib/plans';

/** A build in progress, or the newest build's failure — never both (§5). Renders nothing otherwise. */
export function PlanStatusBanner({ preparing, failure }: { preparing: PlanPreparing | null; failure: PlanFailure | null }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  if (preparing) {
    return (
      <Card tone="info" className="flex items-center justify-between gap-md">
        <p className="text-body-md text-badge-info-fg">Preparing your plan…</p>
        {preparing.progress ? (
          <span className="text-label-md text-badge-info-fg">
            {preparing.progress.done} of {preparing.progress.total}
          </span>
        ) : null}
      </Card>
    );
  }

  if (failure) {
    return (
      <Card tone="neutral" className="flex flex-col items-start gap-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-md text-on-surface">{failure.message}</p>
        <Button
          variant="destructive"
          size="sm"
          loading={retrying}
          loadingLabel="Retrying…"
          onClick={async () => {
            setRetrying(true);
            try {
              await retryPlan();
              router.refresh();
            } finally {
              setRetrying(false);
            }
          }}
        >
          Retry
        </Button>
      </Card>
    );
  }

  return null;
}
