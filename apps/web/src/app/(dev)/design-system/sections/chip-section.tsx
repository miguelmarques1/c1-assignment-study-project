import { Chip, type ChipProps } from '@/components/ui';

import { SectionShell } from './section-shell';

const TONES: NonNullable<ChipProps['tone']>[] = ['neutral', 'accent', 'success', 'warning', 'danger'];

export function ChipSection() {
  return (
    <SectionShell title="Chip" vrId="chip">
      <div className="flex flex-wrap gap-sm">
        {TONES.map((tone) => (
          <Chip key={tone} tone={tone} count={3}>
            {tone}
          </Chip>
        ))}
        <Chip tone="accent" onRemove={() => undefined}>
          removable
        </Chip>
      </div>
    </SectionShell>
  );
}
