import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Avatar, Logo, NavPill, ThemeToggle } from '@/components/ui';
import { getCurrentUser } from '@/lib/server-session';

/**
 * The destinations that exist today. A later feature adds its own entry
 * here rather than changing NavPill itself — see design/README.md for
 * "Scenarios & Practice", deferred to F06.
 */
const DESTINATIONS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
];

/**
 * The API is the authority on whether a session is still alive, so every
 * authenticated render confirms it. An expired or revoked session lands on the
 * login screen with an explanation rather than failing silently on the first
 * data request.
 */
export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?expired=1');
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg p-lg">
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
      {children}
    </div>
  );
}
