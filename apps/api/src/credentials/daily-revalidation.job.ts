import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { CredentialProvider } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { CredentialsService } from './credentials.service';

@Injectable()
export class DailyRevalidationJob {
  private readonly logger = new Logger(DailyRevalidationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

  /**
   * Every stored credential is re-probed regardless of its current status:
   * `valid` can be revoked upstream, `unverified` may now be reachable, and
   * `invalid` may have been re-enabled. Only `missing` has nothing to check,
   * and it has no row.
   */
  @Cron('0 3 * * *', { name: 'credential-revalidation' })
  async run(): Promise<{ checked: number; changed: number }> {
    const rows = await this.prisma.userCredential.findMany({
      select: { userId: true, provider: true, status: true },
    });

    let changed = 0;

    for (const row of rows) {
      try {
        const before = row.status;
        const after = await this.credentials.revalidate(
          row.userId,
          row.provider as CredentialProvider,
        );
        if (after.status !== before) {
          changed += 1;
          this.logger.log(`${row.provider} for ${row.userId}: ${before} → ${after.status}`);
        }
      } catch (error) {
        // One unreadable or unreachable credential must not stop the sweep.
        this.logger.warn(
          `Re-validation failed for ${row.provider}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(`Credential re-validation: ${rows.length} checked, ${changed} changed`);
    return { checked: rows.length, changed };
  }
}
