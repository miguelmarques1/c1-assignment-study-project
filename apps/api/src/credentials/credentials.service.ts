import { Injectable } from '@nestjs/common';
import {
  credentialProviderSchema,
  ERROR_CODES,
  type CredentialProvider,
  type MaskedCredential,
} from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { lastFourOf } from './credential-crypto';
import { CredentialCryptoService } from './credential-crypto.service';
import { ProviderValidationService } from './validation/provider-validation.service';

const MASK = '••••';

export interface DecryptedCredential {
  key: string;
  region: string | null;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly validation: ProviderValidationService,
  ) {}

  /**
   * Always returns an entry per provider, so the interface never has to
   * special-case an absent row — `missing` is the read model's word for it.
   */
  async list(userId: string): Promise<MaskedCredential[]> {
    const rows = await this.prisma.userCredential.findMany({ where: { userId } });

    return credentialProviderSchema.options.map((provider) => {
      const row = rows.find((candidate) => candidate.provider === provider);

      if (!row) {
        return {
          provider,
          status: 'missing',
          maskedKey: null,
          region: null,
          lastValidatedAt: null,
        };
      }

      return {
        provider,
        status: row.status as MaskedCredential['status'],
        maskedKey: `${MASK}${row.lastFour}`,
        region: row.region,
        lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Validates before storing. A rejected key is discarded entirely and any
   * previously stored credential is left untouched — a typo must not cost the
   * working key that was already there.
   */
  async save(
    userId: string,
    provider: CredentialProvider,
    key: string,
    region: string | null,
  ): Promise<MaskedCredential> {
    const outcome = await this.validation.validate(provider, key, region);

    if (outcome.status === 'invalid') {
      throw new AppError(ERROR_CODES.CREDENTIAL_REJECTED, {
        provider,
        providerMessage: outcome.providerMessage,
      });
    }

    const encrypted = this.crypto.encrypt(key);
    // Prisma types Bytes columns as Uint8Array; Node's Buffer generic does not
    // line up with it directly, so the conversion is explicit.
    const data = {
      ciphertext: new Uint8Array(encrypted.ciphertext),
      iv: new Uint8Array(encrypted.iv),
      authTag: new Uint8Array(encrypted.authTag),
      lastFour: lastFourOf(key),
      region: provider === 'azure_speech' ? region : null,
      status: outcome.status,
      lastValidatedAt: new Date(),
    };

    await this.prisma.userCredential.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...data },
      update: data,
    });

    return this.one(userId, provider);
  }

  async remove(userId: string, provider: CredentialProvider): Promise<void> {
    await this.prisma.userCredential.deleteMany({ where: { userId, provider } });
  }

  /** Re-probes a stored credential and persists the fresh status. */
  async revalidate(userId: string, provider: CredentialProvider): Promise<MaskedCredential> {
    const row = await this.prisma.userCredential.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    if (!row) {
      throw new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE, { provider });
    }

    let key: string;
    try {
      key = this.crypto.decrypt({
        ciphertext: Buffer.from(row.ciphertext),
        iv: Buffer.from(row.iv),
        authTag: Buffer.from(row.authTag),
      });
    } catch {
      await this.markStatus(userId, provider, 'invalid');
      throw new AppError(ERROR_CODES.CREDENTIAL_UNREADABLE, { provider });
    }

    const outcome = await this.validation.validate(provider, key, row.region);

    await this.prisma.userCredential.update({
      where: { userId_provider: { userId, provider } },
      data: { status: outcome.status, lastValidatedAt: new Date() },
    });

    return this.one(userId, provider);
  }

  /** Internal: the decrypted credential, for the executor only. */
  async resolveDecrypted(
    userId: string,
    provider: CredentialProvider,
  ): Promise<DecryptedCredential> {
    const row = await this.prisma.userCredential.findUnique({
      where: { userId_provider: { userId, provider } },
    });

    if (!row || row.status === 'invalid') {
      throw new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE, { provider });
    }

    try {
      return {
        key: this.crypto.decrypt({
          ciphertext: Buffer.from(row.ciphertext),
          iv: Buffer.from(row.iv),
          authTag: Buffer.from(row.authTag),
        }),
        region: row.region,
      };
    } catch {
      await this.markStatus(userId, provider, 'invalid');
      throw new AppError(ERROR_CODES.CREDENTIAL_UNREADABLE, { provider });
    }
  }

  async markStatus(
    userId: string,
    provider: CredentialProvider,
    status: 'valid' | 'invalid' | 'unverified',
  ): Promise<void> {
    await this.prisma.userCredential.updateMany({
      where: { userId, provider },
      data: { status },
    });
  }

  private async one(userId: string, provider: CredentialProvider): Promise<MaskedCredential> {
    const all = await this.list(userId);
    return all.find((entry) => entry.provider === provider)!;
  }
}
