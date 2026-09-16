import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getCurrentUser } from '@/lib/server-session';

/**
 * Full-bleed authenticated layout, deliberately outside the `(app)` group:
 * the nav pill invites leaving a live call mid-lesson, and the classroom has
 * its own header (elapsed time, per-participant quality).
 */
export default async function ClassroomLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?expired=1');
  }

  return <div className="h-screen w-screen overflow-hidden">{children}</div>;
}
