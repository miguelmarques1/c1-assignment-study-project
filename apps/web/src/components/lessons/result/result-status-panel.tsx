import {
  pipelineStageLabels,
  type LessonAnalysisStatus,
  type LessonPipelineView,
  type LessonSummary,
} from '@english-quest/shared';
import Link from 'next/link';

import { Card } from '@/components/ui';

import { lessonHref } from '../links';
import { RetryAction } from '../status/retry-action';

const LINK_CLASS = 'text-label-lg text-primary underline-offset-4 hover:underline';

/**
 * What the result area shows while the caller's analysis is not ready:
 * what is running now, the fix for a blocked stage, the reason and a retry
 * for a failed one, or why there is no result at all.
 */
export function ResultStatusPanel({
  lesson,
  analysisStatus,
  pipeline,
}: {
  lesson: LessonSummary;
  analysisStatus: LessonAnalysisStatus;
  pipeline: LessonPipelineView | null;
}) {
  const failedStage = pipeline?.branch?.stages.find((stage) => stage.status === 'failed' && stage.retryable) ?? null;

  if (lesson.status === 'blocked') {
    return (
      <Card tone="neutral" as="section" aria-label="Result status" className="flex flex-col gap-sm">
        <p className="text-title-md text-on-surface">Your result is waiting</p>
        <p className="text-body-md text-on-surface">{lesson.statusReason}</p>
        <Link href="/settings" className={LINK_CLASS}>
          Open settings
        </Link>
      </Card>
    );
  }

  if (lesson.status === 'failed' || analysisStatus === 'failed') {
    return (
      <Card tone="neutral" as="section" aria-label="Result status" className="flex flex-col gap-sm">
        <p className="text-title-md text-error">Your result could not be prepared</p>
        {lesson.statusReason ? <p className="text-body-md text-on-surface">{lesson.statusReason}</p> : null}
        {failedStage ? (
          <RetryAction lessonId={lesson.lessonId} lastAttemptAt={failedStage.lastAttemptAt} />
        ) : (
          <Link href={lessonHref(lesson.lessonId, 'status')} className={LINK_CLASS}>
            See processing status
          </Link>
        )}
      </Card>
    );
  }

  if (lesson.status === 'processing' && analysisStatus === 'pending') {
    return (
      <Card tone="info" as="section" aria-label="Result status" className="flex flex-col gap-sm">
        <p className="text-title-md">Your result is being prepared</p>
        {lesson.activeStage ? <p className="text-body-md">Now: {pipelineStageLabels[lesson.activeStage].active}</p> : null}
        <Link href={lessonHref(lesson.lessonId, 'status')} className={LINK_CLASS}>
          See processing status
        </Link>
      </Card>
    );
  }

  return (
    <Card tone="neutral" as="section" aria-label="Result status" className="flex flex-col gap-sm">
      <p className="text-title-md text-on-surface">There is no result for you in this lesson</p>
      {lesson.statusReason ? <p className="text-body-md text-on-surface">{lesson.statusReason}</p> : null}
    </Card>
  );
}
