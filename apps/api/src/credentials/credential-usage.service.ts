import { Injectable, Logger } from '@nestjs/common';
import type { CredentialProvider } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';

export type UsageOutcome = 'ok' | 'provider_error' | 'blocked';

/**
 * Append-only audit of key usage. Writes here must never be able to fail the
 * work they are auditing — losing an audit row is bad, but failing a lesson
 * analysis because the audit insert timed out would be worse.
 */
@Injectable()
export class CredentialUsageService {
  private readonly logger = new Logger(CredentialUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    userId: string,
    provider: CredentialProvider,
    feature: string,
    outcome: UsageOutcome,
    errorCode?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.credentialUsage.create({
        data: { userId, provider, feature, outcome, errorCode: errorCode ?? null },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record credential usage for ${provider}/${feature}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
