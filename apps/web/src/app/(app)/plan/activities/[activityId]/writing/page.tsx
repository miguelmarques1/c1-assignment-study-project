import { WritingScreen } from '@/components/writing/writing-screen';

export const metadata = { title: 'Writing · English Quest' };

export default async function WritingActivityPage({ params }: { params: Promise<{ activityId: string }> }) {
  const { activityId } = await params;
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-md">
      <WritingScreen activityId={activityId} />
    </main>
  );
}
