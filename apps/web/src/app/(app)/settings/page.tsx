import { SettingsScreen } from '@/components/settings-screen';
import { getCredentials } from '@/lib/credentials-server';

export const metadata = {
  title: 'Settings · English Quest',
};

export default async function SettingsPage() {
  const credentials = await getCredentials();

  return <SettingsScreen initialCredentials={credentials} />;
}
