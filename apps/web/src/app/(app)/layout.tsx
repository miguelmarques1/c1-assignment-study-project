import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/ui';
import { getCurrentUser } from '@/lib/server-session';

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
        <strong className="text-title-lg text-on-surface">English Quest</strong>
        <div className="flex items-center gap-sm text-body-sm text-on-surface-variant">
          <a href="/settings" className="text-secondary underline">
            Settings
          </a>
          <span>· {user.displayName}</span>
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
