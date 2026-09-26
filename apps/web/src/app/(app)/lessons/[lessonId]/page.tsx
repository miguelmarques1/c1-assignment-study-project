import { ResultArea } from '@/components/lessons/result/result-area';
import { getLessonAnalysis, getLessonDetail, getLessonPipeline, getLessonPronunciation } from '@/lib/lessons-server';

/** The Result area — where opening a lesson lands. */
export default async function LessonResultPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const [detail, analysis, pronunciation, pipeline] = await Promise.all([
    getLessonDetail(lessonId),
    getLessonAnalysis(lessonId),
    getLessonPronunciation(lessonId),
    getLessonPipeline(lessonId),
  ]);
  // The layout already renders the not-available and error states for the lesson itself.
  if (!detail.ok) {
    return null;
  }
  return <ResultArea lesson={detail.data} analysis={analysis} pronunciation={pronunciation} pipeline={pipeline} />;
}
