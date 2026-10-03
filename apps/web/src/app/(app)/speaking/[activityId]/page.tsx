import { AreaError } from '@/components/lessons/area-error';
import { SpeakingRunner } from '@/components/speaking/speaking-runner';
import { getSpeakingActivity } from '@/lib/speaking-server';

export const metadata = {
  title: 'Speaking practice · English Quest',
};

export default async function SpeakingPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  const result = await getSpeakingActivity(activityId);

  if (!result.ok) {
    if (result.code === 'PLAN003' || result.code === 'SPEAK001') {
      return (
        <main className="flex flex-col gap-md">
          <AreaError title="We could not find that activity." description="It may have been removed, or it isn’t yours." />
        </main>
      );
    }
    return (
      <main className="flex flex-col gap-md">
        <AreaError title="We could not load this activity." />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-md">
      <h1 className="text-headline-md text-on-surface">{result.data.title}</h1>
      <SpeakingRunner activity={result.data} />
    </main>
  );
}
