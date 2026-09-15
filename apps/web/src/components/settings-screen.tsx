'use client';

import type { CredentialProvider, MaskedCredential } from '@english-quest/shared';
import { useCallback, useEffect, useState } from 'react';

import { Card, Chip, HelpIcon, SettingsIcon } from '@/components/ui';
import { listCredentials } from '@/lib/credentials';
import { CredentialsPanel } from './credentials-panel';

/** `null` while the list hasn't loaded yet — distinct from either status. */
export function aggregateCredentialStatus(
  credentials: MaskedCredential[] | null,
): 'ready' | 'attention' | null {
  if (!credentials) return null;
  return credentials.every((entry) => entry.status === 'valid') ? 'ready' : 'attention';
}

interface Props {
  initialCredentials: MaskedCredential[] | null;
}

export function SettingsScreen({ initialCredentials }: Props) {
  const [credentials, setCredentials] = useState<MaskedCredential[] | null>(initialCredentials);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    let cancelled = false;

    listCredentials()
      .then((list) => {
        if (!cancelled) setCredentials(list);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your credentials.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Only fetch when the server could not provide the list — otherwise the
    // first paint is already correct and a refetch would just flicker.
    if (initialCredentials) {
      return;
    }
    return load();
  }, [initialCredentials, load]);

  function replace(next: MaskedCredential) {
    setCredentials((current) =>
      (current ?? []).map((entry) => (entry.provider === next.provider ? next : entry)),
    );
  }

  function clear(provider: CredentialProvider) {
    setCredentials((current) =>
      (current ?? []).map((entry) =>
        entry.provider === provider
          ? { ...entry, status: 'missing', maskedKey: null, region: null, lastValidatedAt: null }
          : entry,
      ),
    );
  }

  const status = aggregateCredentialStatus(credentials);

  return (
    <main className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <SettingsIcon size={28} />
          <h2 className="text-headline-sm text-on-surface">Settings</h2>
        </div>
        {status ? (
          <Chip tone={status === 'ready' ? 'success' : 'warning'}>
            {status === 'ready' ? 'Environment ready' : 'Keys need attention'}
          </Chip>
        ) : null}
      </div>

      <Card>
        <p className="text-body-md text-on-surface-variant">
          <strong className="text-on-surface">Bring Your Own Key:</strong> English Quest runs every
          AI and Speech call on your own API keys, so the cost lands on your account and your free
          tiers get used. Keys are encrypted before they are stored and are never shown again after
          you save them — replacing one is the only way to change it.
        </p>
      </Card>

      <CredentialsPanel
        credentials={credentials}
        error={error}
        onRetry={load}
        onChanged={replace}
        onRemoved={clear}
      />

      <Card>
        <div className="flex items-center gap-md">
          <HelpIcon size={28} />
          <div className="flex flex-col gap-xs">
            <p className="text-title-md text-on-surface">Need help getting your keys?</p>
            <p className="text-body-md text-on-surface-variant">
              See our quick step-by-step guide for Gemini and Azure Speech, set up in under 2
              minutes.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
