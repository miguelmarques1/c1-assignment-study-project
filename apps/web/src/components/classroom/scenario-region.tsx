'use client';

import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { RoleCardPanel } from './role-card-panel';
import { SituationCard } from './situation-card';
import type { UseScenarioResult } from './use-scenario';

export interface ScenarioRegionProps {
  scenario: UseScenarioResult;
}

function RegionCard({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Scenario"
      className="w-full rounded-lg border-2 border-outline-strong bg-surface-container-lowest p-lg shadow-card"
    >
      {children}
    </section>
  );
}

/**
 * The waiting room's scenario column: `Preparing today's scenario…` while
 * generating, the shared situation and the viewer's own briefing once ready,
 * and the PRD-pinned failure and no-key messages. Nothing here ever blocks
 * joining — the lesson starts with or without a scenario.
 */
export function ScenarioRegion({ scenario }: ScenarioRegionProps) {
  const { view, loading, reroll, retry, rerolling, retrying } = scenario;

  if (loading || !view || view.status === 'pending') {
    return (
      <RegionCard>
        <div className="flex flex-col gap-md">
          <p className="text-title-lg text-on-surface">Preparing today&apos;s scenario…</p>
          <LoadingState variant="text-block" label="Loading the situation" />
        </div>
      </RegionCard>
    );
  }

  if (view.status === 'failed') {
    return (
      <RegionCard>
        <ErrorState
          title="We could not build a situation for today."
          description={retrying ? 'Trying again…' : 'The lesson can still start without one.'}
          onRetry={() => void retry()}
        />
      </RegionCard>
    );
  }

  if (view.status === 'no_scenario' || !view.situation) {
    return (
      <RegionCard>
        <EmptyState
          title="No scenario for this lesson"
          description="The participant who opened the room has no usable Gemini key, so this lesson proceeds without a generated situation."
        />
      </RegionCard>
    );
  }

  return (
    <div className="flex w-full flex-col gap-lg">
      <SituationCard
        situation={view.situation}
        myRoleLabel={view.myRoleLabel}
        reroll={{
          rerollsRemaining: view.rerollsRemaining,
          canReroll: view.canReroll,
          rerolling,
          onReroll: () => void reroll(),
        }}
      />
      <RoleCardPanel card={view.myCard} roleLabel={view.myRoleLabel} />
    </div>
  );
}
