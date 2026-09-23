import { redirect } from 'next/navigation';

import { ClassroomScreen } from '@/components/classroom/classroom-screen';
import { getCurrentUser } from '@/lib/server-session';

export const metadata = {
  title: 'Classroom · English Quest',
};

export default async function ClassroomPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?expired=1');
  }

  return <ClassroomScreen userId={user.id} />;
}
