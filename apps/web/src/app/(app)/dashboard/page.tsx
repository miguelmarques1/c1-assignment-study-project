import { ClassroomHero } from '@/components/dashboard/classroom-hero';
import { PronunciationPracticeCard } from '@/components/dashboard/pronunciation-practice-card';
import { RecentLessons } from '@/components/dashboard/recent-lessons';
import { RecommendedScenarioCard } from '@/components/dashboard/recommended-scenario-card';
import { TodaySessionCard } from '@/components/dashboard/today-session-card';
import { getCredentials } from '@/lib/credentials-server';
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
  const [session, scenario, lessons, currentPlan, credentials] = await Promise.all([
    getClassroomSession(),
    getScenarioView(),
    getLessonList(),
    getCurrentPlan(),
    getCredentials(),
  ]);

  return (
    <main className="flex flex-col gap-md">
      <ClassroomHero session={session} />
      <TodaySessionCard current={currentPlan} />
      <PronunciationPracticeCard current={currentPlan} credentials={credentials} />
      <RecommendedScenarioCard scenario={scenario} />
      <RecentLessons result={lessons} />
    </main>
  );
}
