import { AreaError } from '@/components/lessons/area-error';
import { TranscriptView } from '@/components/lessons/transcript/transcript-view';
import { getLessonTranscript } from '@/lib/lessons-server';

export default async function LessonTranscriptPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const transcript = await getLessonTranscript(lessonId);
  return transcript.ok ? <TranscriptView view={transcript.data} /> : <AreaError title="We could not load the transcript." />;
}
