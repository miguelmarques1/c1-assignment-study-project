import { Stack } from '@/components/ui';

import { SectionShell } from './section-shell';

function Swatch({ label }: { label: string }) {
  return (
    <div className="rounded-md border-2 border-outline-strong bg-primary-container px-md py-sm text-label-md text-on-primary-container">
      {label}
    </div>
  );
}

export function StackSection() {
  return (
    <SectionShell title="Stack" vrId="stack">
      <div className="flex flex-col gap-md">
        <Stack direction="row" gap="sm">
          <Swatch label="row a" />
          <Swatch label="row b" />
          <Swatch label="row c" />
        </Stack>
        <Stack direction="column" gap="xs">
          <Swatch label="column a" />
          <Swatch label="column b" />
        </Stack>
      </div>
    </SectionShell>
  );
}
