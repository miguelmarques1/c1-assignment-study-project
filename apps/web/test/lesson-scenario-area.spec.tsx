import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScenarioArea } from '@/components/lessons/scenario-area';

import { scenarioView } from './fixtures/lessons';

afterEach(() => {
  cleanup();
});

describe('scenario area', () => {
  it('scenario_area_shows_the_full_situation_and_only_my_card', () => {
    const view = scenarioView();
    render(<ScenarioArea view={view} />);

    const situation = screen.getByRole('region', { name: "Today's situation" });
    expect(situation).toHaveTextContent(view.situation!.setting);
    expect(situation).toHaveTextContent(view.situation!.premise);
    for (const role of view.situation!.roles) {
      expect(within(situation).getByText(role.label)).toBeInTheDocument();
      expect(within(situation).getByText(role.relationship)).toBeInTheDocument();
    }
    expect(within(situation).getByText('travel')).toBeInTheDocument();
    for (const hook of view.situation!.discussionHooks) {
      expect(within(situation).getByText(hook)).toBeInTheDocument();
    }
    // Read-only: the scenario cannot change after the lesson.
    expect(screen.queryByRole('button', { name: /New situation/ })).toBeNull();

    const card = screen.getByRole('region', { name: 'Your role card' });
    expect(within(card).getByText('Only you can see this')).toBeInTheDocument();
    expect(card).toHaveTextContent(view.myCard!.objective!);
    expect(screen.getAllByRole('region', { name: 'Your role card' })).toHaveLength(1);
  });

  it('no_scenario_reads_as_such', () => {
    for (const status of ['no_scenario', 'failed', 'pending', 'none'] as const) {
      cleanup();
      render(<ScenarioArea view={scenarioView({ status, situation: null, myRoleLabel: null, myCard: null })} />);
      expect(screen.getByText('No scenario was in play for this lesson.')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Your role card' })).toBeNull();
    }
  });

  it('a_failed_card_keeps_the_role_label', () => {
    render(
      <ScenarioArea
        view={scenarioView({
          myCard: { status: 'failed', background: null, objective: null, constraint: null, register: null, targetExpressions: null },
        })}
      />,
    );
    expect(screen.getByRole('region', { name: 'Your role card' })).toHaveTextContent('The Traveler');
  });
});
