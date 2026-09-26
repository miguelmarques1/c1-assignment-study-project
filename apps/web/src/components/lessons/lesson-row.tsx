import { pipelineStageLabels, type LessonSummary } from '@english-quest/shared';
import Link from 'next/link';

import { Chip, cn, UsersIcon } from '@/components/ui';

import { formatDuration, formatParticipants } from './format';
import { LessonStatusBadge } from './lesson-status-badge';
import { LocalizedTime } from './localized-time';

/**
 * The line under a row that says what to know without opening it: the
 * active stage while processing, the fix or the reason when blocked or
 * failed, and the caller's own headline once ready.
 */
function rowLine(lesson: LessonSummary): { text: string; tone: 'muted' | 'attention' | 'result' } | null {
  if (lesson.status === 'ready') {
    return lesson.headline ? { text: lesson.headline, tone: 'result' } : null;
  }
  if (lesson.status === 'processing') {
    return lesson.activeStage ? { text: pipelineStageLabels[lesson.activeStage].active, tone: 'muted' } : null;
  }
  return lesson.statusReason ? { text: lesson.statusReason, tone: 'attention' } : null;
}

export function LessonRow({ lesson }: { lesson: LessonSummary }) {
  const line = rowLine(lesson);

  return (
    <li>
      <Link
        href={`/lessons/${lesson.lessonId}`}
        className="press-card flex flex-col gap-sm rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-md text-on-surface shadow-card outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        <span className="flex flex-wrap items-center justify-between gap-sm">
          <span className="text-label-md text-on-surface-variant">
            <LocalizedTime iso={lesson.startedAt} format="relative" /> · {formatDuration(lesson.durationSeconds)}
          </span>
          <LessonStatusBadge status={lesson.status} flags={lesson.flags} />
        </span>
        <span className="text-title-md">{lesson.scenarioTitle ?? 'Conversation lesson'}</span>
        <span className="flex flex-wrap items-center gap-sm">
          <span className="inline-flex items-center gap-xs text-body-sm text-on-surface-variant">
            <UsersIcon size={16} />
            {formatParticipants(lesson.participants)}
          </span>
          {lesson.vocabularyDomain ? <Chip>{lesson.vocabularyDomain}</Chip> : null}
        </span>
        {line ? (
          <span
            className={cn(
              'text-body-md',
              line.tone === 'muted' && 'text-on-surface-variant',
              line.tone === 'attention' && 'text-error',
              line.tone === 'result' && 'text-on-surface',
            )}
          >
            {line.text}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
