import { EmptyState } from '@/components/ui';

export interface LessonEndedNoticeProps {
  onReturnToDashboard: () => void;
}

/** Shown when the 120-minute cap closed the lesson automatically, before returning to the dashboard. */
export function LessonEndedNotice({ onReturnToDashboard }: LessonEndedNoticeProps) {
  return (
    <EmptyState
      title="Lesson ended automatically after 2 hours."
      description="The lesson reached the maximum length and was finalized normally. Processing has started."
      action={{ label: 'Back to dashboard', onClick: onReturnToDashboard }}
    />
  );
}
