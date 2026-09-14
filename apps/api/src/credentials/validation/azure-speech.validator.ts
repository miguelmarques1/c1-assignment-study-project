import { Injectable } from '@nestjs/common';

import {
  firstLine,
  humanMessage,
  PROBE_TIMEOUT_MS,
  scrubSecret,
  type ValidationOutcome,
} from './validation-outcome';

@Injectable()
export class AzureSpeechValidator {
  /**
   * Requests a short-lived access token from the regional endpoint. This is the
   * canonical way to check an Azure Speech key: it costs nothing, returns a JWT
   * on success, and exercises the region at the same time — a wrong region
   * fails to resolve here rather than being pre-validated against a list that
   * would go stale whenever Azure adds one.
   */
  async validate(apiKey: string, region: string): Promise<ValidationOutcome> {
    const url = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Length': '0',
        },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });

      if (response.ok) {
        return { status: 'valid', providerMessage: null };
      }

      // 401 and 403 mean the key was read and refused. Anything else — 404 from
      // a region that exists but serves nothing, 429, 5xx — means we could not
      // get an answer about the key, which is not the same as a bad key.
      if (response.status === 401 || response.status === 403) {
        const body = await response.text().catch(() => '');
        const message =
          firstLine(humanMessage(body)) || `Azure rejected this key (HTTP ${response.status}).`;
        return { status: 'invalid', providerMessage: scrubSecret(message, apiKey) };
      }

      return {
        status: 'unverified',
        providerMessage: `Azure Speech responded with HTTP ${response.status}.`,
      };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      return { status: 'unverified', providerMessage: scrubSecret(firstLine(raw), apiKey) };
    }
  }
}
