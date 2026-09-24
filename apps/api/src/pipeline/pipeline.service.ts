import { Injectable, Logger } from '@nestjs/common';
import type {
  CredentialProvider,
  LessonPipelineView,
  PipelineBranchStatus,
  PipelineReasonCode,
  PipelineStage,
  PipelineStageStatus,
  PipelineStageView,
} from '@english-quest/shared';
import type { Lesson, LessonPipelineBranch, LessonPipelineStage } from '@prisma/client';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { LessonAccessService } from './lesson-access.service';
import { PIPELINE_STAGE_ORDER, type QueuedPipelineStage } from './pipeline.constants';
import { PipelineStageRegistry } from './pipeline-stage.registry';
import { PipelineQueueService } from './pipeline-queue.service';
import { PipelineStateService } from './pipeline-state.service';

type BranchWithStages = LessonPipelineBranch & { stages: LessonPipelineStage[] };

/** F07's `storage_unavailable` is a branch status, not a failure code; the view needs a sentence for it. */
const STORAGE_UNAVAILABLE_REASON = 'Storage was unavailable when this recording was verified.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

/** Launch, the caller-scoped pipeline view and the owner's retry. */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly state: PipelineStateService,
    private readonly queue: PipelineQueueService,
    private readonly registry: PipelineStageRegistry,
    private readonly access: LessonAccessService,
  ) {}

  /**
   * F07's hand-off: a participant's recording is verified, so their branch
   * enters transcription. It never throws. By the time it runs, F07 has
   * already deleted that participant's segment objects and put the branch
   * at `transcription`/`queued` — a throw here would make F07's next pass
   * re-assemble from segments that no longer exist and turn a good
   * recording into `recording_missing`. Whatever fails is recovered by the
   * drain instead: a missing stage row by its backfill of queued branches,
   * a missing job by its job check. The cost is one tick, never the branch.
   */
  async launch(input: { lessonId: string; userId: string }, now: Date = new Date()): Promise<void> {
    try {
      const branch = await this.prisma.lessonPipelineBranch.findUniqueOrThrow({
        where: { lessonId_userId: { lessonId: input.lessonId, userId: input.userId } },
        select: { id: true },
      });
      const row = await this.state.ensureStage(branch.id, 'transcription', now);
      await this.queue.enqueue(branch.id, 'transcription', row.run);
    } catch (error) {
      this.logger.warn(
        `Could not launch transcription for lesson ${input.lessonId}, user ${input.userId}: ${errorMessage(error)} — the drain will pick it up.`,
      );
    }
  }

  async getView(lessonId: string, callerId: string): Promise<LessonPipelineView> {
    const lesson = await this.access.requireParticipant(lessonId, callerId);
    return this.buildView(lesson, callerId);
  }

  /**
   * Re-runs the caller's own failed stage, from transcription onward. The
   * stage goes back to `queued` with the next run; everything downstream
   * re-runs as the branch advances again, and upstream results are reused.
   */
  async retry(lessonId: string, callerId: string): Promise<LessonPipelineView> {
    const lesson = await this.access.requireParticipant(lessonId, callerId);
    const branch = await this.findBranch(lessonId, callerId);

    if (!branch) {
      throw AppError.pipelineNotRetryable(null, null);
    }
    if (branch.stage === 'recording') {
      if (branch.status === 'failed' || branch.status === 'storage_unavailable') {
        throw AppError.pipelineRetryRecording(lessonId);
      }
      throw AppError.pipelineNotRetryable(branch.stage, branch.status);
    }

    const row = branch.stages.find((stage) => stage.stage === branch.stage);
    if (!row || row.status !== 'failed' || !this.registry.has(row.stage)) {
      throw AppError.pipelineNotRetryable(branch.stage, row?.status ?? branch.status);
    }

    const requeued = await this.state.requeueFailed(row, new Date());
    if (!requeued) {
      // Someone else moved it between the read and the write.
      throw AppError.pipelineNotRetryable(branch.stage, null);
    }

    await this.queue.enqueue(branch.id, requeued.stage as QueuedPipelineStage, requeued.run).catch((error: unknown) => {
      this.logger.warn(`Could not queue the retried ${requeued.stage} for branch ${branch.id}: ${errorMessage(error)}`);
    });

    return this.buildView(lesson, callerId);
  }

  private findBranch(lessonId: string, userId: string): Promise<BranchWithStages | null> {
    return this.prisma.lessonPipelineBranch.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      include: { stages: true },
    });
  }

  private async buildView(lesson: Lesson, callerId: string): Promise<LessonPipelineView> {
    const now = new Date();
    const branch = await this.findBranch(lesson.id, callerId);
    if (!branch) {
      return { lessonId: lesson.id, serverTime: now.toISOString(), branch: null };
    }

    const order = (stage: string) => PIPELINE_STAGE_ORDER.indexOf(stage as PipelineStage);
    const stages = [...branch.stages].sort((a, b) => order(a.stage) - order(b.stage)).map((row) => this.stageEntry(row));

    return {
      lessonId: lesson.id,
      serverTime: now.toISOString(),
      branch: {
        stage: branch.stage as PipelineStage,
        status: branch.status as PipelineBranchStatus,
        stages: [this.recordingEntry(lesson, branch), ...stages],
      },
    };
  }

  /**
   * The `recording` entry is derived from F07's own columns rather than
   * stored as a stage row — F07 owns that state, and a copy would drift.
   * Retrying a recording is F07's lesson-wide route, never this one.
   */
  private recordingEntry(lesson: Lesson, branch: LessonPipelineBranch): PipelineStageView {
    const base = {
      stage: 'recording' as const,
      startedAt: iso(lesson.startedAt),
      finishedAt: iso(lesson.recordingFinalizedAt),
      lastAttemptAt: iso(branch.launchedAt ?? lesson.recordingFinalizedAt),
      nextAttemptAt: null,
      attempts: branch.attempts,
      providerMessage: null,
      blockedProvider: null,
      retryable: false,
    };

    // F07 leaves a verified branch at `recording`/`queued` with `launched_at`
    // set until the pipeline moves it on; either way its recording is done.
    if (branch.stage !== 'recording' || branch.launchedAt) {
      return { ...base, status: 'completed', reasonCode: null, reason: null };
    }
    if (branch.status === 'failed') {
      return {
        ...base,
        status: 'failed',
        reasonCode: branch.failureCode as PipelineReasonCode,
        reason: branch.failureReason,
      };
    }
    if (branch.status === 'storage_unavailable') {
      return { ...base, status: 'failed', reasonCode: 'storage_unavailable', reason: STORAGE_UNAVAILABLE_REASON };
    }
    return { ...base, status: 'running', finishedAt: null, reasonCode: null, reason: null };
  }

  private stageEntry(row: LessonPipelineStage): PipelineStageView {
    return {
      stage: row.stage as PipelineStage,
      status: row.status as PipelineStageStatus,
      startedAt: iso(row.startedAt),
      finishedAt: iso(row.finishedAt),
      lastAttemptAt: iso(row.lastAttemptAt),
      nextAttemptAt: iso(row.nextAttemptAt),
      attempts: row.attempts,
      reasonCode: row.reasonCode as PipelineReasonCode | null,
      reason: row.reason,
      providerMessage: row.providerMessage,
      blockedProvider: row.blockedProvider as CredentialProvider | null,
      retryable: row.status === 'failed' && this.registry.has(row.stage),
    };
  }
}
