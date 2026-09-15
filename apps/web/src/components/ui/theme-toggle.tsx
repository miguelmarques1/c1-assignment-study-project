'use client';

import { useState } from 'react';

import { applyTheme, persistPreference, readStoredPreference, type ThemePreference } from '@/lib/theme';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const LABEL: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

export function ThemeToggle() {
  // The lazy initializer reads the real preference on the client's first
  // render, which will not match the server's static 'system' default —
  // exactly the case suppressHydrationWarning below exists for, per Next's
  // own documented pattern for this kind of pre-hydration state.
  const [preference, setPreference] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readStoredPreference(),
  );

  function cycle() {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]!;
    setPreference(next);
    persistPreference(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      suppressHydrationWarning
      className="press-button inline-flex items-center gap-xs rounded-md border-2 border-outline-strong bg-surface-container-lowest px-sm py-xs text-label-md text-on-surface outline-offset-2 outline-outline-strong focus-visible:outline-2"
      aria-label={`Theme: ${LABEL[preference]}. Activate to switch.`}
    >
      {LABEL[preference]}
    </button>
  );
}
