import type { ScenarioView } from '@english-quest/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoleCardPanel } from '@/components/classroom/role-card-panel';
import { ScenarioPanel } from '@/components/classroom/scenario-panel';
import { ScenarioRegion } from '@/components/classroom/scenario-region';
import type { UseScenarioResult } from '@/components/classroom/use-scenario';

const VIEW: NonNullable<ScenarioView> = {
  lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
  status: 'ready',
  situation: {
    title: 'Stranded at Gate 12',
    setting: 'Terminal 2, late evening.',
    premise: 'Fewer seats than passengers.',
    roles: [
      { label: 'The Traveler', relationship: 'Passenger whose connection was cancelled' },
      { label: 'The Airline Agent', relationship: 'Rebooking desk agent with limited seats' },
    ],
    vocabularyDomain: 'travel',
    discussionHooks: ['One?', 'Two?', 'Three?'],
  },
  rerollsRemaining: 3,
  canReroll: true,
  myRoleLabel: 'The Traveler',
  myCard: {
    status: 'ready',
    background: 'Only-mine background.',
    objective: 'Only-mine objective.',
    constraint: 'Only-mine constraint.',
    register: 'informal',
    targetExpressions: ['a', 'b', 'c', 'd', 'e', 'f'],
  },
};

function scenario(view: ScenarioView): UseScenarioResult {
  return { view, loading: false, reroll: vi.fn(), retry: vi.fn(), rerolling: false, retrying: false };
}

afterEach(() => {
  cleanup();
});

describe('role card visibility', () => {
  it('renders_only_the_viewers_own_card', () => {
    render(<ScenarioRegion scenario={scenario(VIEW)} />);

    // Exactly one private card on the page, and it says so.
    const cards = screen.getAllByRole('region', { name: 'Your role card' });
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText('Only you can see this')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Only-mine objective.')).toBeInTheDocument();
    expect(screen.getAllByText('Only you can see this')).toHaveLength(1);

    // The partner's seat shows what the shared situation says about it —
    // its label and relationship — and nothing a role card would carry.
    const partnerTile = screen.getByText("Partner's role").closest('li')!;
    expect(partnerTile.textContent).toBe(
      "Partner's roleThe Airline AgentRebooking desk agent with limited seats",
    );
  });

  it('keeps_the_in_call_brief_to_the_viewers_own_card', () => {
    render(<ScenarioPanel scenario={scenario(VIEW)} onClose={vi.fn()} />);

    expect(screen.getAllByRole('region', { name: 'Your role card' })).toHaveLength(1);
    expect(screen.getAllByText('Only you can see this')).toHaveLength(1);
  });

  it('shows_the_role_label_when_the_card_failed', () => {
    render(
      <RoleCardPanel
        roleLabel="The Traveler"
        card={{
          status: 'failed',
          background: null,
          objective: null,
          constraint: null,
          register: null,
          targetExpressions: null,
        }}
      />,
    );

    expect(
      screen.getByText('Your role card could not be generated. You can still play this role.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The Traveler')).toBeInTheDocument();
    expect(screen.getByText('Only you can see this')).toBeInTheDocument();
  });
});
