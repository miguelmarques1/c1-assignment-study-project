import { Global, Module } from '@nestjs/common';

import { CredentialCryptoService } from './credential-crypto.service';
import { AzureSpeechValidator } from './validation/azure-speech.validator';
import { GeminiValidator } from './validation/gemini.validator';
import { ProviderValidationService } from './validation/provider-validation.service';

/**
 * Global because the boot probe resolves the crypto service before any feature
 * module is constructed, and because seven later features reach the vault.
 */
@Global()
@Module({
  providers: [
    CredentialCryptoService,
    GeminiValidator,
    AzureSpeechValidator,
    ProviderValidationService,
  ],
  exports: [CredentialCryptoService, ProviderValidationService],
})
export class CredentialsModule {}
