import { Card, type CardProps } from '@/components/ui';

import { SectionShell } from './section-shell';

const TONES: NonNullable<CardProps['tone']>[] = ['neutral', 'primary', 'info', 'success'];

export function CardSection() {
  return (
    <SectionShell title="Card" vrId="card">
      <div className="grid grid-cols-1 gap-md md:grid-cols-2 lg:grid-cols-4">
        {TONES.map((tone) => (
          <Card key={tone} tone={tone} header={<strong className="text-title-md">{tone}</strong>}>
            <p className="text-body-md">A card in the {tone} tone.</p>
          </Card>
        ))}
      </div>
    </SectionShell>
  );
}
