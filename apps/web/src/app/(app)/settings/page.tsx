import { CredentialsPanel } from '@/components/credentials-panel';
import { getCredentials } from '@/lib/credentials-server';

export const metadata = {
  title: 'Settings · English Quest',
};

export default async function SettingsPage() {
  const credentials = await getCredentials();

  return (
    <main>
      <h2>Settings</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: '44rem' }}>
        English Quest runs every AI and Speech call on your own API keys, so the cost lands on
        your account and your free tiers get used. Keys are encrypted before they are stored and
        are never shown again after you save them — replacing one is the only way to change it.
      </p>

      <CredentialsPanel initial={credentials} />
    </main>
  );
}
