import { Badge, type BadgeProps } from '@/components/ui';

import { SectionShell } from './section-shell';

const STATUSES: BadgeProps['status'][] = ['success', 'warning', 'info', 'danger', 'neutral'];

export function BadgeSection() {
  return (
    <SectionShell title="Badge" vrId="badge">
      <div className="flex flex-wrap gap-sm">
        {STATUSES.map((status) => (
          <Badge key={status} status={status}>
            {status}
          </Badge>
        ))}
      </div>
    </SectionShell>
  );
}
