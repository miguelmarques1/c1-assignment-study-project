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

describe('NavPill options', () => {
  it('a_labelled_always_visible_pill_names_its_landmark', () => {
    usePathname.mockReturnValue('/lessons/abc/transcript');
    render(
      <NavPill
        label="Lesson sections"
        alwaysVisible
        destinations={[
          { href: '/lessons/abc', label: 'Result' },
          { href: '/lessons/abc/transcript', label: 'Transcript' },
        ]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Lesson sections' });
    expect(nav).not.toHaveClass('hidden');
    expect(screen.getByRole('link', { name: 'Transcript' })).toHaveAttribute('aria-current', 'page');
    // Result is an exact match, so it is not also active on a sub-route.
    expect(screen.getByRole('link', { name: 'Result' })).not.toHaveAttribute('aria-current');
  });

  it('a_prefix_destination_stays_active_below_its_path', () => {
    usePathname.mockReturnValue('/lessons/9f1c4d7e/status');
    render(<NavPill destinations={[...DESTINATIONS, { href: '/lessons', label: 'Lessons', matchPrefix: true }]} />);
    expect(screen.getByRole('link', { name: 'Lessons' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('navigation')).toHaveClass('hidden');
  });
});

describe('AppHeader', () => {
  it('the_header_carries_the_lessons_destination_in_order', () => {
    usePathname.mockReturnValue('/lessons');
    render(<AppHeader user={{ id: '3f8b1a20-5c6d-4e7f-8a91-2b3c4d5e6f70', email: 'miguel@example.com', displayName: 'Miguel Marques', sessionExpiresAt: '2026-10-01T00:00:00.000Z' }} />);
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(expect.arrayContaining(['Dashboard', 'Profile', 'Lessons', 'Settings']));
    expect(links.indexOf('Lessons')).toBe(links.indexOf('Profile') + 1);
    expect(screen.getByRole('link', { name: 'Lessons' })).toHaveAttribute('aria-current', 'page');
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
    // The mobile tabs' order: Profile, then F19's Lessons.
    expect(labels).toEqual(['Dashboard', 'Profile', 'Lessons', 'Settings']);
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
  });
});
