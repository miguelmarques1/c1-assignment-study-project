import { Injectable } from '@nestjs/common';
import type { CredentialProvider } from '@english-quest/shared';

import { AzureSpeechValidator } from './azure-speech.validator';
import { GeminiValidator } from './gemini.validator';
import type { ValidationOutcome } from './validation-outcome';

/**
 * Routes a probe to the right provider and returns the single normalized shape
 * the vault stores, so nothing above this layer branches on which provider it
 * is talking to.
 */
@Injectable()
export class ProviderValidationService {
  constructor(
    private readonly gemini: GeminiValidator,
    private readonly azure: AzureSpeechValidator,
  ) {}

  async validate(
    provider: CredentialProvider,
    apiKey: string,
    region?: string | null,
  ): Promise<ValidationOutcome> {
    if (provider === 'gemini') {
      return this.gemini.validate(apiKey);
    }

    if (!region) {
      // Unreachable through the API, where the schema requires it, and through
      // the database, where a check constraint enforces it. Guarded anyway
      // because the daily job reads rows rather than requests.
      return {
        status: 'invalid',
        providerMessage: 'Azure Speech requires a region.',
      };
    }

    return this.azure.validate(apiKey, region);
  }
}
