import { ClassroomHero } from '@/components/dashboard/classroom-hero';
import { RecentLessons } from '@/components/dashboard/recent-lessons';
import { RecommendedScenarioCard } from '@/components/dashboard/recommended-scenario-card';
import { getLessonList } from '@/lib/lessons-server';
import { getClassroomSession, getScenarioView } from '@/lib/server-session';

export const metadata = {
  title: 'Dashboard · English Quest',
};

/**
 * Landing target for a successful login and the mounting point later features
 * extend — the classroom entry point, the study plan and the lesson history all
 * attach here.
 */
export default async function DashboardPage() {
  const [session, scenario, lessons] = await Promise.all([getClassroomSession(), getScenarioView(), getLessonList()]);

  return (
    <main className="flex flex-col gap-md">
      <ClassroomHero session={session} />
      <RecommendedScenarioCard scenario={scenario} />
      <RecentLessons result={lessons} />
      <h2 className="text-headline-sm text-on-surface">Dashboard</h2>
      <p className="text-body-md text-on-surface-variant">
        You are signed in. Your study plan and your progress will appear here as the remaining
        features land.
      </p>
    </main>
  );
}
