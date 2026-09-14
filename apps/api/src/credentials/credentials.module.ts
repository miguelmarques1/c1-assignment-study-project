import { Global, Module } from '@nestjs/common';

import { CredentialCryptoService } from './credential-crypto.service';

/**
 * Global because the boot probe resolves the crypto service before any feature
 * module is constructed, and because seven later features reach the vault.
 */
@Global()
@Module({
  providers: [CredentialCryptoService],
  exports: [CredentialCryptoService],
})
export class CredentialsModule {}
