import type { ScenarioView } from '@english-quest/shared';
import Link from 'next/link';

import { Card, Chip, MicrophoneIcon, Stack } from '@/components/ui';

export interface RecommendedScenarioCardProps {
  scenario: ScenarioView;
}

/**
 * The mockup's "Live Roleplay Highlight" card. Nothing is generated ahead of
 * time in this product (F06's scenario is preparation inside the room, not
 * scheduling), so this card only ever shows a real, already-generated
 * situation when a lesson happens to be open — otherwise it is a static
 * invitation to open one. Its `+75 XP` chip is dropped, per `design/README.md`'s
 * Social-and-comparison clause.
 */
export function RecommendedScenarioCard({ scenario }: RecommendedScenarioCardProps) {
  const situation = scenario?.situation ?? null;

  const heading = situation
    ? (situation.title ?? situation.setting)
    : scenario
      ? "Preparing today's scenario…"
      : "Ready for today's roleplay?";

  const description = situation
    ? situation.premise
    : scenario
      ? 'A classroom is already open — the situation is on its way.'
      : 'Open the classroom to get a fresh situation, a role to play and expressions to practice, generated the moment someone joins.';

  return (
    <Card className="flex flex-col items-start justify-between gap-md lg:flex-row lg:items-center">
      <Stack gap="xs" className="w-full flex-1 lg:w-auto">
        <div className="flex items-center gap-xs">
          <span
            className="h-2.5 w-2.5 rounded-full bg-tertiary motion-safe:animate-pulse"
            aria-hidden="true"
          />
          <span className="text-label-sm font-bold uppercase tracking-wide text-tertiary">
            Recommended scenario for today
          </span>
        </div>
        <h3 className="text-headline-sm font-bold text-on-surface">{heading}</h3>
        {/* max-w-128 = 32rem via Tailwind's numeric spacing scale; max-w-xl would
            collide with our own --spacing-xl token and resolve to 2.5rem instead. */}
        <p className="max-w-128 text-body-md text-on-surface-variant">{description}</p>
        {situation ? (
          <div className="flex flex-wrap items-center gap-sm pt-xs">
            <Chip>{situation.vocabularyDomain}</Chip>
            <Chip>
              {situation.roles.length} role{situation.roles.length === 1 ? '' : 's'}
            </Chip>
          </div>
        ) : null}
      </Stack>
      <Link
        href="/classroom"
        className="press-button inline-flex shrink-0 items-center justify-center gap-sm rounded-xl border-2 border-outline-strong bg-secondary px-lg py-md text-label-lg font-semibold text-on-secondary outline-offset-2 outline-outline-strong focus-visible:outline-2"
      >
        <MicrophoneIcon />
        {situation ? 'Enter the conversation' : 'Open classroom'}
      </Link>
    </Card>
  );
}
