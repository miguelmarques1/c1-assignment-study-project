import { EmptyState } from '@/components/ui';

import { SectionShell } from './section-shell';

export function EmptySection() {
  return (
    <SectionShell title="Empty" vrId="empty">
      <EmptyState
        title="No lessons yet"
        description="Start your first live classroom session to see it appear here."
        action={{ label: 'Start a lesson', onClick: () => undefined }}
      />
    </SectionShell>
  );
}
