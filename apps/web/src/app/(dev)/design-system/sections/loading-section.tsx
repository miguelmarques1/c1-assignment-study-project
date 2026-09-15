import { LoadingState, type LoadingVariant } from '@/components/ui';

import { SectionShell } from './section-shell';

const VARIANTS: LoadingVariant[] = ['card-grid', 'list', 'text-block', 'meter'];

export function LoadingSection() {
  return (
    <SectionShell title="Loading" vrId="loading">
      <div className="flex flex-col gap-lg">
        {VARIANTS.map((variant) => (
          <div key={variant}>
            <p className="mb-xs text-label-md text-on-surface-variant">{variant}</p>
            <LoadingState variant={variant} label={`Loading ${variant}…`} />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
