import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getCurrentUser } from '@/lib/server-session';

/**
 * The full-screen runner frame (F16 A21): outside `(app)`, so there is no
 * `AppHeader` competing with the activity's own top bar. It keeps the
 * session check and the classroom's 1200px container (`max-w-300`) so the
 * passage and the questions can sit side by side.
 */
export default async function ActivitiesLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?expired=1');
  }

  return <div className="mx-auto flex w-full max-w-300 flex-col gap-lg p-lg">{children}</div>;
}
