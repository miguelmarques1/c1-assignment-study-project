import type { ClassroomSession } from '@english-quest/shared';
import Link from 'next/link';

import { Card, Stack } from '@/components/ui';

export interface ClassroomHeroProps {
  session: ClassroomSession;
}

/**
 * The mockup's hero banner: the `Open classroom` primary action, and the
 * live-lesson affordance — reflecting an in-progress lesson rather than
 * offering a fresh start as if nothing were happening.
 */
export function ClassroomHero({ session }: ClassroomHeroProps) {
  const inProgress = session !== null;

  return (
    <Card tone="primary" className="flex flex-col items-start gap-md sm:flex-row sm:items-center sm:justify-between">
      <Stack gap="xs">
        <h2 className="text-headline-sm text-on-primary-container">Live Classroom</h2>
        <p className="text-body-md text-on-primary-container">
          {inProgress
            ? 'A lesson is already in progress.'
            : 'Practice a real conversation with your study partner, live.'}
        </p>
      </Stack>
      <Link
        href="/classroom"
        className="press-button inline-flex items-center justify-center gap-sm rounded-md border-2 border-outline-strong bg-primary px-lg py-sm text-title-md font-semibold text-on-primary outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        {inProgress ? 'Rejoin classroom' : 'Open classroom'}
      </Link>
    </Card>
  );
}
