'use client';

import {
  ERROR_CODES,
  providerLabels,
  type CredentialProvider,
  type CredentialStatus,
  type MaskedCredential,
} from '@english-quest/shared';
import { useState } from 'react';

import {
  AzureSpeechIcon,
  Badge,
  Button,
  Card,
  GeminiIcon,
  Stack,
  TextField,
  TrashIcon,
  type BadgeProps,
} from '@/components/ui';
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

/** The design system has no idea what a "credential" is — the mapping lives here, at the call site. */
const STATUS_BADGE: Record<CredentialStatus, BadgeProps['status']> = {
  valid: 'success',
  invalid: 'danger',
  unverified: 'warning',
  missing: 'neutral',
};

const PROVIDER_ICON: Record<CredentialProvider, typeof GeminiIcon> = {
  gemini: GeminiIcon,
  azure_speech: AzureSpeechIcon,
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
  const titleId = `${credential.provider}-title`;
  const ProviderIcon = PROVIDER_ICON[credential.provider];

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
    <Card
      aria-labelledby={titleId}
      header={
        <div className="flex items-center justify-between gap-md">
          <div className="flex items-center gap-sm">
            <ProviderIcon size={24} />
            <h3 id={titleId} className="text-title-md text-on-surface">
              {label}
            </h3>
          </div>
          <Badge status={STATUS_BADGE[credential.status]}>{STATUS_LABEL[credential.status]}</Badge>
        </div>
      }
    >
      <Stack gap="md">
        {isMissing ? (
          <p className="text-body-md text-on-surface-variant">{MISSING_COPY[credential.provider]}</p>
        ) : (
          <>
            <TextField label="Key" value={credential.maskedKey ?? ''} readOnlyPresentation />
            <dl className="flex flex-col gap-xs">
              {credential.region ? (
                <div className="flex justify-between gap-md text-body-sm">
                  <dt className="text-on-surface-variant">Region</dt>
                  <dd className="font-mono text-on-surface">{credential.region}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-md text-body-sm">
                <dt className="text-on-surface-variant">Last checked</dt>
                <dd className="text-on-surface">{relativeTime(credential.lastValidatedAt)}</dd>
              </div>
            </dl>
          </>
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
          <Stack direction="row" gap="sm" wrap>
            <Button variant="primary" type="button" onClick={() => setEditing(true)} disabled={busy}>
              {isMissing ? 'Add key' : 'Replace key'}
            </Button>
            {!isMissing ? (
              <>
                <Button variant="neutral" type="button" onClick={handleRevalidate} disabled={busy}>
                  {busy ? 'Checking…' : 'Re-check'}
                </Button>
                <Button
                  variant="destructive"
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  aria-label={`Delete ${label} key`}
                >
                  <TrashIcon />
                </Button>
              </>
            ) : null}
          </Stack>
        )}

        {!editing && error ? (
          <p className="text-body-sm text-error" role="alert">
            {error}
          </p>
        ) : null}
      </Stack>
    </Card>
  );
}
