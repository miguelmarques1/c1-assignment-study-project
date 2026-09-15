import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/ui/theme-toggle';
import { applyTheme, persistPreference, readStoredPreference, resolveTheme, THEME_STORAGE_KEY } from '@/lib/theme';

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') && prefersDark,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('theme resolution', () => {
  it('default_is_light_regardless_of_system_preference', () => {
    mockMatchMedia(true);
    expect(readStoredPreference()).toBe('light');

    mockMatchMedia(false);
    expect(readStoredPreference()).toBe('light');
  });

  it('an_explicit_system_choice_still_follows_the_os', () => {
    mockMatchMedia(true);
    expect(resolveTheme('system')).toBe('dark');

    mockMatchMedia(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('an_explicit_choice_overrides_the_system', () => {
    mockMatchMedia(true);
    expect(resolveTheme('light')).toBe('light');
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('the_choice_survives_a_reload', () => {
    mockMatchMedia(false);
    persistPreference('dark');

    // Nothing here reads the in-memory value — readStoredPreference re-parses
    // localStorage from scratch, standing in for a fresh script run after a reload.
    expect(readStoredPreference()).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('persisting_system_is_stored_explicitly_and_survives_a_reload', () => {
    persistPreference('dark');
    persistPreference('system');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(readStoredPreference()).toBe('system');
  });
});

describe('ThemeToggle', () => {
  it('the_toggle_announces_the_active_theme', async () => {
    mockMatchMedia(false);
    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: /light theme/i });
    expect(button).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole('button', { name: /dark theme/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /dark theme/i }));
    expect(screen.getByRole('button', { name: /system theme/i })).toBeInTheDocument();
  });
});
