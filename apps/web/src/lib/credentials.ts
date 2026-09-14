import type { CredentialProvider, MaskedCredential } from '@english-quest/shared';

import { apiFetch } from './api-client';

export function listCredentials(): Promise<MaskedCredential[]> {
  return apiFetch<MaskedCredential[]>('/credentials');
}

export function saveCredential(
  provider: CredentialProvider,
  key: string,
  region: string | null,
): Promise<MaskedCredential> {
  return apiFetch<MaskedCredential>(`/credentials/${provider}`, {
    method: 'PUT',
    body: JSON.stringify({ key, region }),
  });
}

export function deleteCredential(provider: CredentialProvider): Promise<void> {
  return apiFetch<void>(`/credentials/${provider}`, { method: 'DELETE' });
}

export function revalidateCredential(provider: CredentialProvider): Promise<MaskedCredential> {
  return apiFetch<MaskedCredential>(`/credentials/${provider}/revalidate`, { method: 'POST' });
}

/** Relative time, because an exact timestamp on a settings card is noise. */
export function relativeTime(iso: string | null): string {
  if (!iso) {
    return 'never';
  }

  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
