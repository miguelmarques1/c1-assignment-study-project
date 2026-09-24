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

export const PRONUNCIATION_PROVIDER = 'azure_pronunciation_assessment';

/**
 * F10: capped at 30 s of audio per request — exactly F09's `max_duration_ms`,
 * so every selected excerpt fits one call.
 */
export const PRONUNCIATION_ASSESSMENT_TIMEOUT_MS = 60 * 1000;

/** The REST API for short audio, with the pronunciation assessment header. No Speech SDK. */
export function pronunciationAssessmentUrl(region: string, locale: string): string {
  return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`;
}

/**
 * The `Pronunciation-Assessment` header's JSON, base64-encoded, with the
 * reference text filled in per request. Phoneme granularity, prosody and
 * miscue detection cover every error type the PRD lists; `PhonemeAlphabet:
 * IPA` is the ledger's own alphabet (`phoneme:/θ/`), verified live in stage 2.
 */
export function pronunciationAssessmentParams(referenceText: string): Record<string, unknown> {
  return {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
    EnableProsodyAssessment: true,
    PhonemeAlphabet: 'IPA',
  };
}
