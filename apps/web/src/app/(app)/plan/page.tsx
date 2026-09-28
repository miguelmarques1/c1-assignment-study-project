import { PlanScreen } from '@/components/plan/plan-screen';
import { getCurrentPlan, getPlanHistory } from '@/lib/plans-server';

export const metadata = {
  title: 'Plan · English Quest',
};

export default async function PlanPage() {
  const [current, history] = await Promise.all([getCurrentPlan(), getPlanHistory()]);

  return (
    <main className="flex flex-col gap-md">
      <h1 className="text-headline-md text-on-surface">Plan</h1>
      <PlanScreen current={current} history={history} />
    </main>
  );
}
