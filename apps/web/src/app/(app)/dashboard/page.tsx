import { ClassroomHero } from '@/components/dashboard/classroom-hero';
import { RecentLessons } from '@/components/dashboard/recent-lessons';
import { RecommendedScenarioCard } from '@/components/dashboard/recommended-scenario-card';
import { TodaySessionCard } from '@/components/dashboard/today-session-card';
import { getLessonList } from '@/lib/lessons-server';
import { getCurrentPlan } from '@/lib/plans-server';
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
  const [session, scenario, lessons, currentPlan] = await Promise.all([
    getClassroomSession(),
    getScenarioView(),
    getLessonList(),
    getCurrentPlan(),
  ]);

  return (
    <main className="flex flex-col gap-md">
      <ClassroomHero session={session} />
      <TodaySessionCard current={currentPlan} />
      <RecommendedScenarioCard scenario={scenario} />
      <RecentLessons result={lessons} />
    </main>
  );
}
