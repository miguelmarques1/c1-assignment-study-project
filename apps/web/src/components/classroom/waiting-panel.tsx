import type { ClassroomAwaiting } from '@english-quest/shared';

import { Card, Stack } from '@/components/ui';

export interface WaitingPanelProps {
  awaiting: ClassroomAwaiting[];
}

/** Lists every other account with a seat available that is not yet connected, capped at the remaining seats. */
function namesList(awaiting: ClassroomAwaiting[]): string {
  const names = awaiting.map((entry) => entry.displayName);
  if (names.length === 0) {
    return 'others to join';
  }
  if (names.length === 1) {
    return `${names[0]} to join`;
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} to join`;
}

/** `Waiting for {names} to join`, plus the labelled region F06 mounts its scenario into. */
export function WaitingPanel({ awaiting }: WaitingPanelProps) {
  return (
    <Stack gap="md" align="center" className="p-lg text-center">
      <p role="status" className="text-title-md text-on-surface">
        Waiting for {namesList(awaiting)}
      </p>
      <Card aria-label="Scenario" className="min-h-24 w-full">
        {/* F06 mounts the waiting-area scenario panel here. */}
      </Card>
    </Stack>
  );
}
