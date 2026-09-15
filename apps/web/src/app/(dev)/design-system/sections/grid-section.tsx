import { Grid } from '@/components/ui';

import { SectionShell } from './section-shell';

function Cell({ label }: { label: string }) {
  return (
    <div className="rounded-md border-2 border-outline-strong bg-surface-container px-md py-sm text-center text-label-md text-on-surface">
      {label}
    </div>
  );
}

export function GridSection() {
  return (
    <SectionShell title="Grid" vrId="grid">
      <Grid columns={4} gap="sm">
        <Cell label="1" />
        <Cell label="2" />
        <Cell label="3" />
        <Cell label="4" />
      </Grid>
    </SectionShell>
  );
}
