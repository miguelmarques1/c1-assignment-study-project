'use client';

import { useState } from 'react';

import { SegmentedControl } from '@/components/ui';

import { SectionShell } from './section-shell';

const RANGES = [
  { value: 'all', label: 'All time' },
  { value: '90d', label: '90 days' },
  { value: '30d', label: '30 days' },
] as const;

export function SegmentedControlSection() {
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('all');
  const [first, setFirst] = useState<(typeof RANGES)[number]['value']>('90d');

  return (
    <SectionShell title="Segmented control" vrId="segmented-control">
      <div className="flex flex-wrap items-center gap-lg">
        <SegmentedControl label="Time range" options={RANGES} value={range} onChange={setRange} />
        <SegmentedControl label="Another selection" options={RANGES} value={first} onChange={setFirst} />
      </div>
    </SectionShell>
  );
}
