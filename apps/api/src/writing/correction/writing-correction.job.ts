import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { WRITING_DEFAULT_OPTIONS, WRITING_OPTIONS, WRITING_SWEEP_BATCH, WRITING_SWEEP_INTERVAL_MS, type WritingOptions } from '../writing.constants';
import { WritingRepository } from '../writing.repository';
import { WritingCorrectionRunner } from './writing-correction.runner';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface WritingCorrectionSweepResult {
  reclaimed: number;
}

/**
 * Reclaims every `running` correction whose lease has expired — after an API
 * restart, or a runner that crashed outright — and runs it (A10). One
 * failure never stops the tick; a correction the live run already settled
 * in the meantime is simply skipped, since `claimExpiredCorrections` only
 * ever selects rows still `running`.
 */
@Injectable()
export class WritingCorrectionJob {
  private readonly logger = new Logger(WritingCorrectionJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: WritingRepository,
    private readonly runner: WritingCorrectionRunner,
    @Optional() @Inject(WRITING_OPTIONS) private readonly options: WritingOptions = WRITING_DEFAULT_OPTIONS,
  ) {}

  @Interval('writing-correction-sweep', WRITING_SWEEP_INTERVAL_MS)
  async run(now: Date = new Date()): Promise<WritingCorrectionSweepResult> {
    const ids = await this.prisma.$transaction((tx) =>
      this.repository.claimExpiredCorrections(tx, now, this.options.correctionLeaseMs, WRITING_SWEEP_BATCH),
    );
    for (const id of ids) {
      try {
        await this.runner.claimAndRun(id);
      } catch (error) {
        this.logger.warn(`Writing correction sweep could not run ${id}: ${errorMessage(error)}`);
      }
    }
    if (ids.length > 0) {
      this.logger.log(`Writing correction sweep reclaimed ${ids.length} correction(s).`);
    }
    return { reclaimed: ids.length };
  }
}
