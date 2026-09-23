import type { ScenarioView } from '@english-quest/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScenarioPanel } from '@/components/classroom/scenario-panel';
import { ScenarioRegion } from '@/components/classroom/scenario-region';
import type { UseScenarioResult } from '@/components/classroom/use-scenario';

const READY_VIEW: NonNullable<ScenarioView> = {
  lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
  status: 'ready',
  situation: {
    title: 'Stranded at Gate 12',
    setting: 'Terminal 2 of a busy airport, late on a stormy evening.',
    premise: 'The last flight out was cancelled and there are fewer seats than passengers.',
    roles: [
      { label: 'The Traveler', relationship: 'Passenger whose connection was cancelled' },
      { label: 'The Airline Agent', relationship: 'Rebooking desk agent with limited seats' },
    ],
    vocabularyDomain: 'travel',
    discussionHooks: [
      'Who deserves the last seat?',
      'What does the airline owe its passengers?',
      'Is bending the rules ever fair?',
    ],
  },
  rerollsRemaining: 2,
  canReroll: true,
  myRoleLabel: 'The Traveler',
  myCard: {
    status: 'ready',
    background: 'You missed your sister’s wedding once already this year.',
    objective: 'Get on the next flight tonight, whatever it takes.',
    constraint: 'You cannot afford a hotel.',
    register: 'neutral',
    targetExpressions: ['to be fair', 'with all due respect', 'I understand, but', 'the bottom line is', 'let us be realistic', 'as a matter of fact'],
  },
};

function scenario(view: ScenarioView, overrides: Partial<UseScenarioResult> = {}): UseScenarioResult {
  return {
    view,
    loading: false,
    reroll: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    rerolling: false,
    retrying: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('ScenarioRegion (waiting room)', () => {
  it('shows_the_preparing_state_while_pending', () => {
    render(<ScenarioRegion scenario={scenario({ ...READY_VIEW, status: 'pending', situation: null, myCard: null })} />);

    expect(screen.getByText("Preparing today's scenario…")).toBeInTheDocument();
    // F21's page-state convention: the skeleton announces itself as loading.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders_the_situation_as_the_mockup_describes', () => {
    render(<ScenarioRegion scenario={scenario(READY_VIEW)} />);
    const situation = screen.getByRole('region', { name: "Today's situation" });

    expect(within(situation).getByRole('heading', { name: 'Stranded at Gate 12' })).toBeInTheDocument();
    expect(within(situation).getByText(/Terminal 2 of a busy airport/)).toHaveTextContent(
      'The last flight out was cancelled',
    );
    expect(within(situation).getByText('travel')).toBeInTheDocument();

    const mine = within(situation).getByText('Your role').closest('li')!;
    expect(within(mine).getByText('The Traveler')).toBeInTheDocument();
    expect(within(mine).getByText('Passenger whose connection was cancelled')).toBeInTheDocument();
    const theirs = within(situation).getByText("Partner's role").closest('li')!;
    expect(within(theirs).getByText('The Airline Agent')).toBeInTheDocument();
    expect(within(theirs).getByText('Rebooking desk agent with limited seats')).toBeInTheDocument();

    for (const hook of READY_VIEW.situation!.discussionHooks) {
      expect(within(situation).getByText(hook).tagName).toBe('LI');
    }
  });

  it('shows_the_remaining_rerolls', async () => {
    const state = scenario(READY_VIEW);
    render(<ScenarioRegion scenario={state} />);

    const button = screen.getByRole('button', { name: 'New situation (2 rerolls left)' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(state.reroll).toHaveBeenCalledTimes(1);
  });

  it('disables_the_reroll_at_the_limit', () => {
    render(<ScenarioRegion scenario={scenario({ ...READY_VIEW, rerollsRemaining: 0, canReroll: false })} />);

    expect(screen.getByRole('button', { name: 'New situation (0 rerolls left)' })).toBeDisabled();
    expect(screen.getByText('You have used all 3 rerolls for this lesson.')).toBeInTheDocument();
  });

  it('tells_a_non_opener_why_the_reroll_is_disabled', () => {
    render(<ScenarioRegion scenario={scenario({ ...READY_VIEW, canReroll: false })} />);

    expect(screen.getByRole('button', { name: /New situation/ })).toBeDisabled();
    expect(
      screen.getByText('Only the participant who opened the room can change the situation.'),
    ).toBeInTheDocument();
  });

  it('offers_try_again_when_generation_failed', async () => {
    const state = scenario({ ...READY_VIEW, status: 'failed', situation: null, myCard: null });
    render(<ScenarioRegion scenario={state} />);

    expect(screen.getByText('We could not build a situation for today.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('lets_the_lesson_start_without_a_scenario', () => {
    render(
      <ScenarioRegion
        scenario={scenario({ ...READY_VIEW, status: 'no_scenario', situation: null, myCard: null, myRoleLabel: null })}
      />,
    );

    expect(screen.getByText('No scenario for this lesson')).toBeInTheDocument();
    // Nothing here blocks: no error, no retry, no disabled join.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('composes_only_from_design_tokens', () => {
    const { container } = render(<ScenarioRegion scenario={scenario(READY_VIEW)} />);

    for (const element of container.querySelectorAll('*')) {
      expect(element.getAttribute('style')).toBeNull();
      const className = element.getAttribute('class') ?? '';
      expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(className).not.toMatch(/\[\d/);
    }
  });
});

describe('ScenarioPanel (in-call brief)', () => {
  it('opens_the_in_call_panel_with_the_situation_and_the_viewers_card', async () => {
    const onClose = vi.fn();
    render(<ScenarioPanel scenario={scenario(READY_VIEW)} onClose={onClose} />);
    const panel = screen.getByRole('complementary', { name: 'Scenario panel' });

    expect(within(panel).getByText(READY_VIEW.situation!.setting)).toBeInTheDocument();
    expect(within(panel).getByText('Who deserves the last seat?')).toBeInTheDocument();
    expect(within(panel).getByText('Your role: The Traveler')).toBeInTheDocument();
    expect(within(panel).getByText(READY_VIEW.myCard!.objective!)).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Close scenario panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says_so_when_the_lesson_has_no_scenario', () => {
    render(
      <ScenarioPanel
        scenario={scenario({ ...READY_VIEW, status: 'no_scenario', situation: null, myCard: null })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('No scenario for this lesson.')).toBeInTheDocument();
  });
});
