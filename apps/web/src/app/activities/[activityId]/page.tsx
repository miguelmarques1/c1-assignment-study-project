import { AreaError } from '@/components/lessons/area-error';
import { ObjectiveRunner } from '@/components/activity/objective-runner';
import { EmptyState } from '@/components/ui';
import { getActivity } from '@/lib/activities-server';

export const metadata = {
  title: 'Activity · English Quest',
};

export default async function ActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const result = await getActivity(activityId);

  if (!result.ok) {
    if (result.code === 'PLAN003' || result.code === 'VAL001') {
      return (
        <main className="flex flex-col gap-md">
          <EmptyState
            title="We could not find that activity."
            description="It may have been removed, or it isn’t yours."
            action={{ label: 'Back to Today', href: '/dashboard' }}
          />
        </main>
      );
    }
    return (
      <main className="flex flex-col gap-md">
        <AreaError title="We could not load this activity." />
      </main>
    );
  }

  if (result.data.objective === null) {
    // Writing, speaking and pronunciation have their own runners; this one has nothing to show for them.
    return (
      <main className="flex flex-col gap-md">
        <EmptyState
          title="This activity isn't available here."
          description="Open it from your plan."
          action={{ label: 'Go to your plan', href: '/plan' }}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-md">
      <ObjectiveRunner initialView={result.data} />
    </main>
  );
}
