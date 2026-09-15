import { ErrorState } from '@/components/ui';

import { SectionShell } from './section-shell';

export function ErrorSection() {
  return (
    <SectionShell title="Error" vrId="error">
      <ErrorState
        title="Couldn't load your lessons"
        description="Check your connection and try again."
        onRetry={() => undefined}
      />
    </SectionShell>
  );
}
