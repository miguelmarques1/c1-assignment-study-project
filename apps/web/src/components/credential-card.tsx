'use client';

import {
  ERROR_CODES,
  providerLabels,
  type CredentialProvider,
  type CredentialStatus,
  type MaskedCredential,
} from '@english-quest/shared';
import { useState } from 'react';

import { ApiRequestError } from '@/lib/api-client';
import {
  deleteCredential,
  relativeTime,
  revalidateCredential,
  saveCredential,
} from '@/lib/credentials';
import { CredentialForm } from './credential-form';

/** Pinned by the PRD — each provider states what is lost without its key. */
const MISSING_COPY: Record<CredentialProvider, string> = {
  gemini:
    'Without a Gemini key, your lessons will be transcribed and scored but not analyzed, and you will not get a role card.',
  azure_speech: 'Without an Azure Speech key, your lessons cannot be transcribed or scored.',
};

const STATUS_LABEL: Record<CredentialStatus, string> = {
  valid: 'Valid',
  invalid: 'Invalid',
  unverified: 'Not verified',
  missing: 'Missing',
};

interface Props {
  credential: MaskedCredential;
  onChanged: (next: MaskedCredential) => void;
  onRemoved: (provider: CredentialProvider) => void;
}

export function CredentialCard({ credential, onChanged, onRemoved }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);

  const label = providerLabels[credential.provider];
  const isMissing = credential.status === 'missing';

  async function handleSave(key: string, region: string | null) {
    setBusy(true);
    setError(null);
    setProviderMessage(null);

    try {
      const saved = await saveCredential(credential.provider, key, region);
      onChanged(saved);
      setEditing(false);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message);
        if (caught.code === ERROR_CODES.CREDENTIAL_REJECTED) {
          const details = caught.details as { providerMessage?: string } | null;
          setProviderMessage(details?.providerMessage ?? null);
        }
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
      // The form stays open on failure so the value can be corrected rather
      // than retyped from scratch.
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteCredential(credential.provider);
      onRemoved(credential.provider);
    } catch {
      setError('Could not delete the key. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevalidate() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await revalidateCredential(credential.provider));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not re-validate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card credential-card" aria-labelledby={`${credential.provider}-title`}>
      <header className="credential-head">
        <h3 id={`${credential.provider}-title`}>{label}</h3>
        <span className={`badge badge-${credential.status}`}>
          {STATUS_LABEL[credential.status]}
        </span>
      </header>

      {isMissing ? (
        <p className="subtitle">{MISSING_COPY[credential.provider]}</p>
      ) : (
        <dl className="credential-meta">
          <div>
            <dt>Key</dt>
            <dd className="mono">{credential.maskedKey}</dd>
          </div>
          {credential.region ? (
            <div>
              <dt>Region</dt>
              <dd className="mono">{credential.region}</dd>
            </div>
          ) : null}
          <div>
            <dt>Last checked</dt>
            <dd>{relativeTime(credential.lastValidatedAt)}</dd>
          </div>
        </dl>
      )}

      {editing ? (
        <CredentialForm
          provider={credential.provider}
          submitting={busy}
          error={error}
          providerMessage={providerMessage}
          onSubmit={handleSave}
          onCancel={() => {
            setEditing(false);
            setError(null);
            setProviderMessage(null);
          }}
        />
      ) : (
        <div className="row">
          <button className="primary" type="button" onClick={() => setEditing(true)} disabled={busy}>
            {isMissing ? 'Add key' : 'Replace key'}
          </button>
          {!isMissing ? (
            <>
              <button className="secondary" type="button" onClick={handleRevalidate} disabled={busy}>
                {busy ? 'Checking…' : 'Re-check'}
              </button>
              <button className="danger" type="button" onClick={handleDelete} disabled={busy}>
                Delete
              </button>
            </>
          ) : null}
        </div>
      )}

      {!editing && error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
