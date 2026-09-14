'use client';

import { azureRegionField, type CredentialProvider } from '@english-quest/shared';
import { useState, type FormEvent } from 'react';

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
      <div className="field">
        <label htmlFor={`${provider}-key`}>API key</label>
        <input
          id={`${provider}-key`}
          type="password"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          disabled={submitting}
          required
        />
      </div>

      {needsRegion ? (
        <div className="field">
          <label htmlFor={`${provider}-region`}>Region</label>
          <input
            id={`${provider}-region`}
            type="text"
            placeholder="brazilsouth"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            disabled={submitting}
            required
          />
        </div>
      ) : null}

      <div className="row">
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Validating…' : 'Save and validate'}
        </button>
        <button className="secondary" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>

      {localError ?? error ? (
        <p className="error" role="alert">
          {localError ?? error}
          {/* The provider's own wording, verbatim, beneath the plain-language line. */}
          {providerMessage ? <span className="provider-message">{providerMessage}</span> : null}
        </p>
      ) : null}
    </form>
  );
}
