/**
 * The three-way result every provider probe normalizes to.
 *
 * The distinction that matters is between "the provider said no" and "we could
 * not ask": a rejection discards the key, an unreachable provider stores it and
 * retries later. Collapsing them would either throw away good keys during an
 * outage or keep bad ones forever.
 */
export type ValidationStatus = 'valid' | 'invalid' | 'unverified';

export interface ValidationOutcome {
  status: ValidationStatus;
  /** The provider's own wording, shown verbatim to the user. Never our paraphrase. */
  providerMessage: string | null;
}

export const PROBE_TIMEOUT_MS = 5_000;

/**
 * Providers echo request material in error messages often enough that this is
 * not paranoia. Every outcome passes through here before it leaves the probe.
 */
export function scrubSecret(message: string, secret: string): string {
  if (secret.length < 8) {
    return message;
  }
  return message.split(secret).join('***');
}

export function firstLine(message: string): string {
  return message.split('\n')[0]?.trim() ?? message;
}

/**
 * Both providers wrap their human sentence inside `{ error: { message } }` and
 * hand the whole JSON body over as the error text. Shown raw, the settings card
 * becomes a wall of JSON where the PRD asks for the provider's own wording.
 */
export function humanMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (typeof parsed.error?.message === 'string') {
      return parsed.error.message;
    }
  } catch {
    // Not JSON — use it as it came.
  }
  return raw;
}

/** Rejects with a timeout error once the probe budget is spent. */
export function withTimeout<T>(promise: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Probe timed out after ${ms}ms`)), ms),
    ),
  ]);
}
