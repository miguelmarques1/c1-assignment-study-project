import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppHeader } from '@/components/app-header';
import { Avatar, NavPill } from '@/components/ui';

const usePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathname(),
}));

const DESTINATIONS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
];

describe('NavPill', () => {
  it('the_pill_renders_exactly_the_existing_destinations', () => {
    usePathname.mockReturnValue('/dashboard');
    render(<NavPill destinations={DESTINATIONS} />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('the_active_destination_is_marked_for_assistive_tech', () => {
    usePathname.mockReturnValue('/settings');
    render(<NavPill destinations={DESTINATIONS} />);

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });
});

describe('Avatar', () => {
  it('the_avatar_shows_initials_and_announces_the_full_name', () => {
    render(<Avatar displayName="Miguel Marques" email="miguel@example.com" />);

    const avatar = screen.getByRole('img', { name: 'Miguel Marques' });
    expect(avatar).toBeInTheDocument();
    expect(avatar.textContent).toBe('MM');
  });

  it('falls_back_to_the_email_when_the_name_yields_nothing', () => {
    render(<Avatar displayName="   " email="learner@example.com" />);

    expect(screen.getByRole('img').textContent).toBe('L');
  });
});

describe('header', () => {
  it('the_header_carries_no_streak_or_points', () => {
    usePathname.mockReturnValue('/dashboard');
    render(
      <div>
        <NavPill destinations={DESTINATIONS} />
        <Avatar displayName="Miguel Marques" email="miguel@example.com" />
      </div>,
    );

    expect(screen.queryByText(/streak/i)).toBeNull();
    expect(screen.queryByText(/\bXP\b/)).toBeNull();
  });

  it('the_header_carries_the_profile_destination', () => {
    usePathname.mockReturnValue('/profile');
    render(
      <AppHeader
        user={{
          id: '4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8',
          email: 'miguel@example.com',
          displayName: 'Miguel Marques',
          sessionExpiresAt: '2026-09-26T10:00:00.000Z',
        }}
      />,
    );

    const nav = screen.getByRole('link', { name: 'Profile' }).closest('nav') ?? document.body;
    const labels = Array.from(nav.querySelectorAll('a')).map((link) => link.textContent);
    // F19's Lessons slots in between Profile and Settings, mirroring the mobile tabs.
    expect(labels).toEqual(['Dashboard', 'Profile', 'Settings']);
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
  });
});
