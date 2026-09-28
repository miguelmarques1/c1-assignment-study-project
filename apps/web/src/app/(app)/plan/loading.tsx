import { LoadingState } from '@/components/ui';

export default function PlanLoading() {
  return (
    <main className="flex flex-col gap-md">
      <h1 className="text-headline-md text-on-surface">Plan</h1>
      <LoadingState variant="list" label="Loading your plan" />
    </main>
  );
}
