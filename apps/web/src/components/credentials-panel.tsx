'use client';

import type { CredentialProvider, MaskedCredential } from '@english-quest/shared';

import { ErrorState, Grid, LoadingState } from '@/components/ui';
import { CredentialCard } from './credential-card';

interface Props {
  credentials: MaskedCredential[] | null;
  error: string | null;
  onRetry: () => void;
  onChanged: (next: MaskedCredential) => void;
  onRemoved: (provider: CredentialProvider) => void;
}

/**
 * Presentational: the credential list, its loading and error states. State
 * lives one level up, in `SettingsScreen`, which also derives the status
 * chip from the same list — the two would drift apart if each owned a
 * separate copy.
 */
export function CredentialsPanel({ credentials, error, onRetry, onChanged, onRemoved }: Props) {
  if (error) {
    return (
      <ErrorState
        title="Could not load your credentials"
        description="Check your connection and try again."
        onRetry={onRetry}
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
          onChanged={onChanged}
          onRemoved={onRemoved}
        />
      ))}
    </Grid>
  );
}
