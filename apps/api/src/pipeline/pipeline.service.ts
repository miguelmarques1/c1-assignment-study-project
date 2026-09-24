import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineStateService } from './pipeline-state.service';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Launch and route logic for the post-lesson pipeline. */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly state: PipelineStateService,
    private readonly queue: PipelineQueueService,
  ) {}

  /**
   * F07's hand-off: a participant's recording is verified, so their branch
   * enters transcription. The stage row is written first and is durable; if
   * adding its job then fails, the drain adds it on its next tick, so a
   * Redis hiccup at lesson end costs seconds, not the branch. A Postgres
   * failure still throws, and F07's finalizer retries on its next tick.
   */
  async launch(input: { lessonId: string; userId: string }, now: Date = new Date()): Promise<void> {
    const branch = await this.prisma.lessonPipelineBranch.findUniqueOrThrow({
      where: { lessonId_userId: { lessonId: input.lessonId, userId: input.userId } },
      select: { id: true },
    });

    const row = await this.state.ensureStage(branch.id, 'transcription', now);

    await this.queue.enqueue(branch.id, 'transcription', row.run).catch((error: unknown) => {
      this.logger.warn(
        `Could not queue transcription for lesson ${input.lessonId}, user ${input.userId}: ${errorMessage(error)} — the drain will retry.`,
      );
    });
  }
}
