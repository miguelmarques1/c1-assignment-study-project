import { redirect } from 'next/navigation';

import { AreaError } from '@/components/lessons/area-error';
import { PlanDetailScreen } from '@/components/plan/plan-detail-screen';
import { getCurrentPlan, getPlan } from '@/lib/plans-server';

export const metadata = {
  title: 'Plan · English Quest',
};

/** A past plan's read-only detail. The active plan's own id redirects to `/plan` instead of duplicating it here. */
export default async function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const [current, result] = await Promise.all([getCurrentPlan(), getPlan(planId)]);

  if (current.ok && current.data.plan?.id === planId) {
    redirect('/plan');
  }

  if (!result.ok) {
    return (
      <main className="flex flex-col gap-md">
        {result.code === 'PLAN001' ? (
          <AreaError title="We could not find that plan." description="It may have been removed, or it isn’t yours." />
        ) : (
          <AreaError title="We could not load that plan." />
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-md">
      <PlanDetailScreen plan={result.data} />
    </main>
  );
}
