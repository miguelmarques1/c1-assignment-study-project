import { CredentialsPanel } from '@/components/credentials-panel';
import { getCredentials } from '@/lib/credentials-server';

export const metadata = {
  title: 'Settings · English Quest',
};

export default async function SettingsPage() {
  const credentials = await getCredentials();

  return (
    <main className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <h2 className="text-headline-sm text-on-surface">Settings</h2>
        <p className="max-w-3xl text-body-md text-on-surface-variant">
          English Quest runs every AI and Speech call on your own API keys, so the cost lands on
          your account and your free tiers get used. Keys are encrypted before they are stored and
          are never shown again after you save them — replacing one is the only way to change it.
        </p>
      </div>

      <CredentialsPanel initial={credentials} />
    </main>
  );
}
