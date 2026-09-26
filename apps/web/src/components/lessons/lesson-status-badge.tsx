import type { BadgeStatus, ChipTone } from '@english-quest/design-tokens';
import {
  lessonHistoryFlagLabels,
  lessonHistoryStatusLabels,
  type LessonHistoryFlag,
  type LessonHistoryStatus,
} from '@english-quest/shared';

import { Badge, Chip } from '@/components/ui';

/** Each status keeps its own label: two statuses may share a colour, never a name (F21: no status by colour alone). */
const STATUS_BADGE: Record<LessonHistoryStatus, BadgeStatus> = {
  processing: 'info',
  ready: 'success',
  blocked: 'warning',
  failed: 'danger',
  recording_failed: 'danger',
  too_short: 'neutral',
};

const FLAG_TONE: Record<LessonHistoryFlag, ChipTone> = {
  partial: 'warning',
  no_scenario: 'neutral',
  ended_unexpectedly: 'accent',
};

/** The caller's own status as a badge, then its flags as chips beside it (F19, A1). */
export function LessonStatusBadge({ status, flags }: { status: LessonHistoryStatus; flags: LessonHistoryFlag[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-xs">
      <Badge status={STATUS_BADGE[status]}>{lessonHistoryStatusLabels[status]}</Badge>
      {flags.map((flag) => (
        <Chip key={flag} tone={FLAG_TONE[flag]}>
          {lessonHistoryFlagLabels[flag]}
        </Chip>
      ))}
    </span>
  );
}
