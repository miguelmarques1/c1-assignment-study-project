import { StatusArea } from '@/components/lessons/status/status-area';
import { getLessonDetail, getLessonPipeline, getLessonRecording } from '@/lib/lessons-server';

export default async function LessonStatusPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const [detail, pipeline, recording] = await Promise.all([
    getLessonDetail(lessonId),
    getLessonPipeline(lessonId),
    getLessonRecording(lessonId),
  ]);
  // The layout already renders the not-available and error states for the lesson itself.
  if (!detail.ok) {
    return null;
  }
  return <StatusArea lesson={detail.data} pipeline={pipeline} recording={recording} />;
}
