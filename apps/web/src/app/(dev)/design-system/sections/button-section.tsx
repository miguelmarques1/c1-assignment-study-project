import { Button, type ButtonProps } from '@/components/ui';

import { SectionShell } from './section-shell';

const VARIANTS: NonNullable<ButtonProps['variant']>[] = ['primary', 'secondary', 'neutral', 'destructive'];
const SIZES: NonNullable<ButtonProps['size']>[] = ['sm', 'md', 'lg'];

export function ButtonSection() {
  return (
    <SectionShell title="Button" vrId="button">
      <div className="flex flex-col gap-sm">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-sm">
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-sm">
          <Button variant="primary" loading>
            Save
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="neutral" aria-label="Icon only example">
            ✓
          </Button>
        </div>
      </div>
    </SectionShell>
  );
}
