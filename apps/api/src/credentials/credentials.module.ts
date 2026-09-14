import { Global, Module } from '@nestjs/common';

import { CredentialCryptoService } from './credential-crypto.service';
import { CredentialExecutorService } from './credential-executor.service';
import { CredentialUsageService } from './credential-usage.service';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { DailyRevalidationJob } from './daily-revalidation.job';
import { AzureSpeechValidator } from './validation/azure-speech.validator';
import { GeminiValidator } from './validation/gemini.validator';
import { ProviderValidationService } from './validation/provider-validation.service';

/**
 * Global because the boot probe resolves the crypto service before any feature
 * module is constructed, and because seven later features reach the vault
 * through the executor.
 */
@Global()
@Module({
  controllers: [CredentialsController],
  providers: [
    CredentialCryptoService,
    CredentialsService,
    CredentialUsageService,
    CredentialExecutorService,
    DailyRevalidationJob,
    GeminiValidator,
    AzureSpeechValidator,
    ProviderValidationService,
  ],
  exports: [CredentialCryptoService, CredentialsService, CredentialExecutorService],
})
export class CredentialsModule {}
