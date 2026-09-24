/**
 * Fixed Azure Speech values. The region comes from the owner's stored
 * credential, never from configuration: each key is used against the
 * region it was saved with.
 */

export const FAST_TRANSCRIPTION_PROVIDER = 'azure_fast_transcription';

/** The GA version of the fast transcription API this client was written against. */
export const FAST_TRANSCRIPTION_API_VERSION = '2025-10-15';

/**
 * Per attempt. The PRD's budget for a 60-minute track is 10 minutes, so an
 * attempt running longer has already missed it and counts as a transient failure.
 */
export const FAST_TRANSCRIPTION_TIMEOUT_MS = 10 * 60 * 1000;

/** The same regional host family F02's `issueToken` probe validates the key against. */
export function fastTranscriptionUrl(region: string): string {
  return `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=${FAST_TRANSCRIPTION_API_VERSION}`;
}
