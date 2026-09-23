import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppHeader } from '@/components/app-header';
import { getCurrentUser } from '@/lib/server-session';

/**
 * Outside the `(app)` group only for its width: the classroom mockups lay a
 * video stage beside a scenario column, which needs the mockups' 1200px
 * container rather than the 4xl one dashboard and settings use. It carries
 * the same header as every other authenticated screen, and it scrolls like
 * one — the control bar is sticky, so nothing below the fold is unreachable.
 *
 * max-w-300 = 75rem via Tailwind's numeric spacing scale; the named max-w-*
 * sizes collide with our own --spacing-* tokens.
 */
export default async function ClassroomLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?expired=1');
  }

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-lg p-lg">
      <AppHeader user={user} />
      {children}
    </div>
  );
}
