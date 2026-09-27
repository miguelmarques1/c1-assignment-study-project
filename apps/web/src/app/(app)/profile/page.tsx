import { ProfileScreen } from '@/components/profile/profile-screen';
import { getProfileView } from '@/lib/server-session';

export const metadata = {
  title: 'Profile · English Quest',
};

interface ProfilePageProps {
  searchParams: Promise<{ tag?: string | string[] }>;
}

/**
 * The caller's learning profile (F12). `?tag=` opens that tag's detail on
 * arrival, which is where a lesson result's error-card chip leads (F19).
 */
export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const [view, params] = await Promise.all([getProfileView(), searchParams]);
  const tag = typeof params.tag === 'string' && params.tag.length > 0 ? params.tag : null;

  return <ProfileScreen initialView={view} initialTag={tag} />;
}
