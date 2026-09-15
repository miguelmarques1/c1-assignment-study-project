'use client';

import { azureRegionField, type CredentialProvider } from '@english-quest/shared';
import { useState, type FormEvent } from 'react';

import { Button, LockIcon, Stack, TextField } from '@/components/ui';

interface Props {
  provider: CredentialProvider;
  submitting: boolean;
  error: string | null;
  providerMessage: string | null;
  onSubmit: (key: string, region: string | null) => void;
  onCancel: () => void;
}

export function CredentialForm({
  provider,
  submitting,
  error,
  providerMessage,
  onSubmit,
  onCancel,
}: Props) {
  const [key, setKey] = useState('');
  const [region, setRegion] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const needsRegion = provider === 'azure_speech';
  const shownError = localError ?? error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (key.trim().length < 20) {
      setLocalError('That key looks too short.');
      return;
    }

    if (needsRegion) {
      const parsed = azureRegionField.safeParse(region);
      if (!parsed.success) {
        setLocalError(parsed.error.issues[0]?.message ?? 'Check the region.');
        return;
      }
      onSubmit(key.trim(), parsed.data);
      return;
    }

    onSubmit(key.trim(), null);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="md">
        <TextField
          label="API key"
          leadingIcon={<LockIcon />}
          type="password"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          disabled={submitting}
          required
        />

        {needsRegion ? (
          <TextField
            label="Region"
            placeholder="brazilsouth"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            disabled={submitting}
            required
          />
        ) : null}

        <Stack direction="row" gap="sm">
          <Button variant="primary" type="submit" loading={submitting} loadingLabel="Validating…">
            Save and validate
          </Button>
          <Button variant="neutral" type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        </Stack>

        {shownError ? (
          <p className="text-body-sm text-error" role="alert">
            {shownError}
            {/* The provider's own wording, verbatim, beneath the plain-language line. */}
            {providerMessage ? (
              <span className="block font-mono text-body-sm text-on-surface-variant">{providerMessage}</span>
            ) : null}
          </p>
        ) : null}
      </Stack>
    </form>
  );
}
