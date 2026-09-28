import type { CurrentUser } from '@english-quest/shared';

import { Avatar, Logo, NavPill, ThemeToggle, type NavDestination } from '@/components/ui';

/**
 * The destinations that exist today. A later feature adds its own entry
 * here rather than changing NavPill itself — see design/README.md for
 * "Scenarios & Practice", deferred to F06. The order mirrors the mobile
 * shell's tabs (Today, Plan, Profile, Lessons, Settings): Dashboard, Profile
 * (F12), Lessons (F19), Settings.
 */
const DESTINATIONS: NavDestination[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plan', label: 'Plan', matchPrefix: true },
  { href: '/profile', label: 'Profile' },
  { href: '/lessons', label: 'Lessons', matchPrefix: true },
  { href: '/settings', label: 'Settings' },
];

export interface AppHeaderProps {
  user: CurrentUser;
}

/**
 * The header every authenticated mockup carries — dashboard, settings and
 * the four classroom screens alike. Shared rather than copied so the
 * classroom's wider container never drifts from the rest of the app.
 */
export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-md border-b-2 border-outline-strong pb-md">
      <a href="/dashboard" className="flex items-center gap-sm">
        <Logo size={32} />
        <strong className="text-title-lg text-on-surface">English Quest</strong>
      </a>
      <NavPill destinations={DESTINATIONS} />
      <div className="flex items-center gap-sm">
        <Avatar displayName={user.displayName} email={user.email} />
        <ThemeToggle />
      </div>
    </header>
  );
}
