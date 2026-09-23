import type { ScenarioView } from '@english-quest/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RecommendedScenarioCard } from '@/components/dashboard/recommended-scenario-card';

const READY: ScenarioView = {
  lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
  status: 'ready',
  situation: {
    title: 'Stranded at Gate 12',
    setting: 'Terminal 2, late evening.',
    premise: 'The last flight out was cancelled and there are fewer seats than passengers.',
    roles: [
      { label: 'The Traveler', relationship: 'Passenger' },
      { label: 'The Airline Agent', relationship: 'Agent' },
    ],
    vocabularyDomain: 'travel',
    discussionHooks: ['One?', 'Two?', 'Three?'],
  },
  rerollsRemaining: 3,
  canReroll: false,
  myRoleLabel: null,
  myCard: null,
};

afterEach(() => {
  cleanup();
});

describe('RecommendedScenarioCard', () => {
  it('links_into_the_classroom', () => {
    render(<RecommendedScenarioCard scenario={null} />);
    expect(screen.getByRole('link', { name: 'Open classroom' })).toHaveAttribute('href', '/classroom');

    cleanup();
    render(<RecommendedScenarioCard scenario={READY} />);
    expect(screen.getByRole('link', { name: 'Enter the conversation' })).toHaveAttribute('href', '/classroom');
  });

  it('shows_the_open_lessons_situation_when_it_is_ready', () => {
    render(<RecommendedScenarioCard scenario={READY} />);

    expect(screen.getByRole('heading', { name: 'Stranded at Gate 12' })).toBeInTheDocument();
    expect(screen.getByText(READY!.situation!.premise)).toBeInTheDocument();
    expect(screen.getByText('travel')).toBeInTheDocument();
    expect(screen.getByText('2 roles')).toBeInTheDocument();
  });

  it('invites_opening_the_classroom_when_nothing_is_generated_yet', () => {
    render(<RecommendedScenarioCard scenario={null} />);

    expect(screen.getByRole('heading', { name: "Ready for today's roleplay?" })).toBeInTheDocument();
  });

  it('carries_no_xp_chip', () => {
    const { container } = render(<RecommendedScenarioCard scenario={READY} />);

    expect(container.textContent).not.toMatch(/\bXP\b/);
  });

  it('composes_only_from_design_tokens', () => {
    const { container } = render(<RecommendedScenarioCard scenario={READY} />);

    for (const element of container.querySelectorAll('*')) {
      expect(element.getAttribute('style')).toBeNull();
      const className = element.getAttribute('class') ?? '';
      expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(className).not.toMatch(/\[\d/);
    }
  });
});
