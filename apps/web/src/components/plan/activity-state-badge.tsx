import type { BadgeStatus } from '@english-quest/design-tokens';
import type { PlanActivityState } from '@english-quest/shared';

import { Badge } from '@/components/ui';

const STATE: Record<PlanActivityState, { status: BadgeStatus; label: string }> = {
  pending: { status: 'neutral', label: 'Pending' },
  in_progress: { status: 'info', label: 'In progress' },
  completed: { status: 'success', label: 'Completed' },
  skipped: { status: 'warning', label: 'Skipped' },
};

export function ActivityStateBadge({ state }: { state: PlanActivityState }) {
  const { status, label } = STATE[state];
  return <Badge status={status}>{label}</Badge>;
}
