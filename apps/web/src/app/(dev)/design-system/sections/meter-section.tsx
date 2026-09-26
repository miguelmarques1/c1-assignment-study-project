import { Meter } from '@/components/ui';

import { SectionShell } from './section-shell';

export function MeterSection() {
  return (
    <SectionShell title="Meter" vrId="meter">
      <div className="flex flex-col gap-md">
        <Meter label="Grammar" value={72} />
        <Meter label="Vocabulary" value={58} delta={4} />
        <Meter label="Pronunciation" value={41} delta={-3} />
        <Meter label="Interaction" value={66} delta={null} />
        <Meter label="Fluency" value={null} state="warming-up" />
      </div>
    </SectionShell>
  );
}
