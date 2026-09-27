import type {
  LearningProfileView,
  LedgerEntryDetailView,
  LedgerEntryListView,
  LedgerEntryView,
} from '@english-quest/shared';

import { apiFetch } from './api-client';

/** The caller's profile from the browser — the retry path when the server-side read failed. */
export function fetchProfile(): Promise<LearningProfileView> {
  return apiFetch<LearningProfileView>('/profile');
}

/** One of the caller's ledger records, with its examples and sources. */
export function fetchLedgerEntry(entryId: string): Promise<LedgerEntryDetailView> {
  return apiFetch<LedgerEntryDetailView>(`/profile/ledger/${encodeURIComponent(entryId)}`);
}

/** The caller's record for an exact tag, or null — how `/profile?tag=` turns a tag into an entry. */
export async function findLedgerEntryByTag(tag: string): Promise<LedgerEntryView | null> {
  const list = await apiFetch<LedgerEntryListView>(`/profile/ledger?tag=${encodeURIComponent(tag)}`);
  return list.entries[0] ?? null;
}
