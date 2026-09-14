import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';

import {
  firstLine,
  humanMessage,
  scrubSecret,
  withTimeout,
  type ValidationOutcome,
} from './validation-outcome';

/**
 * Signals that the key itself was refused, as opposed to the request failing to
 * complete. Google returns 400 with `API_KEY_INVALID` for a bad key, and 403
 * when the key exists but is not permitted.
 */
function looksLikeRejection(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 401 || status === 403) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message);
}

@Injectable()
export class GeminiValidator {
  /**
   * Lists models — the cheapest call that still proves the key is accepted.
   * It reads no user data and generates no tokens.
   */
  async validate(apiKey: string): Promise<ValidationOutcome> {
    try {
      const client = new GoogleGenAI({ apiKey });
      await withTimeout(Promise.resolve(client.models.list()));
      return { status: 'valid', providerMessage: null };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = scrubSecret(firstLine(humanMessage(raw)), apiKey);

      return looksLikeRejection(error)
        ? { status: 'invalid', providerMessage: message }
        : { status: 'unverified', providerMessage: message };
    }
  }
}
