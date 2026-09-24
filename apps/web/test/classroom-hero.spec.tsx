import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomHero } from '@/components/dashboard/classroom-hero';

const OPEN_SESSION = {
  lessonId: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
  status: 'live' as const,
  openedBy: '3f8b1a20-5c6d-4e7f-8a91-2b3c4d5e6f70',
  startedAt: '2026-09-15T14:10:03.000Z',
  maxParticipants: 2,
  participants: [],
  awaiting: [],
  recording: {
    status: 'recording' as const,
    since: '2026-09-15T14:10:04.000Z',
    mine: { status: 'recording' as const, capturedSeconds: 60 },
  },
};

afterEach(() => {
  cleanup();
});

describe('ClassroomHero', () => {
  it('renders_the_primary_action_linking_to_the_classroom', () => {
    render(<ClassroomHero session={null} />);

    const link = screen.getByRole('link', { name: 'Open classroom' });
    expect(link).toHaveAttribute('href', '/classroom');
  });

  it('surfaces_an_open_lesson', () => {
    render(<ClassroomHero session={OPEN_SESSION} />);

    // Reflects the in-progress lesson rather than offering a fresh start.
    expect(screen.queryByText('Open classroom')).toBeNull();
    expect(screen.getByRole('link', { name: 'Rejoin classroom' })).toHaveAttribute(
      'href',
      '/classroom',
    );
    expect(screen.getByText('A lesson is already in progress.')).toBeInTheDocument();
  });

  it('composes_only_from_design_tokens', () => {
    const { container } = render(<ClassroomHero session={null} />);

    const elements = container.querySelectorAll('*');
    for (const element of elements) {
      expect(element.getAttribute('style')).toBeNull();
      const className = element.getAttribute('class') ?? '';
      expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(className).not.toMatch(/\[\d/);
    }
  });
});
