import { AreaError } from '@/components/lessons/area-error';
import { ScenarioArea } from '@/components/lessons/scenario-area';
import { getLessonScenario } from '@/lib/lessons-server';

export default async function LessonScenarioPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const scenario = await getLessonScenario(lessonId);
  return scenario.ok ? <ScenarioArea view={scenario.data} /> : <AreaError title="We could not load this lesson's scenario." />;
}
