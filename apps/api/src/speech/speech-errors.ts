/**
 * Typed Azure Speech failures. Each carries the provider's own wording
 * (already scrubbed of the key) and, when there was one, the HTTP status —
 * `CredentialExecutorService` reads `status` to tell a refused key (401/403,
 * which invalidates it) from every other failure, which must not.
 */
export abstract class SpeechError extends Error {
  constructor(
    readonly providerMessage: string | null,
    readonly status: number | null = null,
  ) {
    super(providerMessage ?? 'Azure Speech request failed.');
  }
}

/** 401 or 403: the key was read and refused. */
export class SpeechAuthRejectedError extends SpeechError {
  override readonly name = 'SpeechAuthRejectedError';
}

/** 429: a rate limit or a spent quota. */
export class SpeechThrottledError extends SpeechError {
  override readonly name = 'SpeechThrottledError';
}

/** 5xx, a network error, a timeout or an unreadable response: worth another attempt. */
export class SpeechServiceError extends SpeechError {
  override readonly name = 'SpeechServiceError';
}

/** 400, 413, 415 or 422: the service will not take this audio, however often it is sent. */
export class SpeechAudioRejectedError extends SpeechError {
  override readonly name = 'SpeechAudioRejectedError';
}

/** 404: the key's region serves no fast transcription. A key from another region fixes it. */
export class SpeechRegionUnsupportedError extends SpeechError {
  override readonly name = 'SpeechRegionUnsupportedError';
}
