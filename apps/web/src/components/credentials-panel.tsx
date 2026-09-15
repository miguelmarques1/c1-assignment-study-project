'use client';

import type { CredentialProvider, MaskedCredential } from '@english-quest/shared';
import { useCallback, useEffect, useState } from 'react';

import { ErrorState, Grid, LoadingState } from '@/components/ui';
import { listCredentials } from '@/lib/credentials';
import { CredentialCard } from './credential-card';

interface Props {
  /** Server-rendered starting point, so the page has content before hydration. */
  initial?: MaskedCredential[] | null;
}

export function CredentialsPanel({ initial = null }: Props) {
  const [credentials, setCredentials] = useState<MaskedCredential[] | null>(initial);
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
    if (initial) {
      return;
    }
    return load();
  }, [initial, load]);

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

  if (error) {
    return (
      <ErrorState
        title="Could not load your credentials"
        description="Check your connection and try again."
        onRetry={load}
      />
    );
  }

  if (!credentials) {
    return <LoadingState variant="card-grid" label="Loading your credentials…" />;
  }

  return (
    <Grid columns={2} gap="md">
      {credentials.map((credential) => (
        <CredentialCard
          key={credential.provider}
          credential={credential}
          onChanged={replace}
          onRemoved={clear}
        />
      ))}
    </Grid>
  );
}
