import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import type { PipelineStageHandler, StageRunContext } from '../pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../pipeline/pipeline-stage.registry';
import { PrismaService } from '../prisma/prisma.service';
import { PlanActivationService } from '../plans/plan-activation.service';
import { PlanComposerService } from '../plans/plan-composer.service';
import { PlanSupersessionService } from '../plans/plan-supersession.service';
import { PLAN_GENERATION_RETRY_POLICY } from '../plans/plan.constants';

/**
 * The `plan_generation` stage (F15): the pipeline's last stage, where every
 * profiled branch already waits. Never blocks on a key — a missing or
 * rejected one composes deterministically instead (spec A4). Skips
 * composing at all when a newer lesson or an existing plan already
 * outranks this one (A2), and is idempotent per (user, lesson, `lesson`)
 * so a retried run never pays for a second F14 batch or model call.
 */
@Injectable()
export class PlanGenerationStageHandler implements PipelineStageHandler, OnModuleInit {
  private readonly logger = new Logger(PlanGenerationStageHandler.name);
  readonly stage = 'plan_generation' as const;
  readonly provider = null;
  readonly retryPolicy = PLAN_GENERATION_RETRY_POLICY;

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly prisma: PrismaService,
    private readonly supersession: PlanSupersessionService,
    private readonly composer: PlanComposerService,
    private readonly activation: PlanActivationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(context: StageRunContext): Promise<void> {
    const { lessonId, userId, branchId } = context;
    const now = new Date();

    const existing = await this.prisma.studyPlan.findUnique({
      where: { userId_lessonId_origin: { userId, lessonId, origin: 'lesson' } },
      select: { id: true },
    });
    if (existing) {
      await context.complete(async () => undefined);
      return;
    }

    const supersededReason = await this.supersession.isSuperseded(userId, lessonId, 'lesson', now);
    if (supersededReason) {
      this.logger.log(`plan_generation for branch ${branchId} superseded (${supersededReason}); no plan built.`);
      await context.complete(async () => undefined);
      return;
    }

    const lesson = await this.prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      select: { startedAt: true, openedAt: true },
    });
    const lessonTime = lesson.startedAt ?? lesson.openedAt;

    const composed = await this.composer.compose({
      userId,
      lessonId,
      origin: 'lesson',
      now,
      onProgress: (done, total) => context.reportProgress(done, total),
    });

    await context.complete(async (tx) => {
      const result = await this.activation.activate(tx, userId, composed, lessonTime);
      this.logger.log(`Plan ${result.outcome} for branch ${branchId} (${composed.composition}, ${composed.selection.notes.length} note(s)).`);
    });
  }
}
