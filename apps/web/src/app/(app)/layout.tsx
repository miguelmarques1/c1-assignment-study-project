import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

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
    <div className="app-shell">
      <header className="app-header">
        <strong>English Quest</strong>
        <span className="who">
          <a href="/settings">Settings</a> · {user.displayName}
        </span>
      </header>
      {children}
    </div>
  );
}
