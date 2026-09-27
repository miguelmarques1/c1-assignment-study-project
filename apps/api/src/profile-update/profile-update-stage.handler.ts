import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { LessonAnalysisReader } from '../analysis/analysis-result.reader';
import type { PipelineStageHandler, StageRunContext } from '../pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../pipeline/pipeline-stage.registry';
import { PrismaService } from '../prisma/prisma.service';
import type { IngestionResult, ProfileSourceInput } from '../profile/profile-ingestion.contract';
import { ProfileIngestionService } from '../profile/profile-ingestion.service';
import { PROFILE_UPDATE_RETRY_POLICY } from '../profile/profile.constants';
import { PronunciationResultReader } from '../pronunciation/pronunciation-result.reader';
import { analysisSource, pronunciationSource } from './lesson-profile-sources';

/**
 * The `profile_update` stage (F12): one participant's lesson lands in their
 * own learning profile. Every branch F11 analysed is already waiting here.
 * Both of the lesson's sources — pronunciation first, then the analysis —
 * are applied in the transaction that completes the stage, so a crash
 * between the two can never leave half a lesson in the profile, and a
 * re-run skips whatever the job or an earlier attempt already applied.
 * Calls no provider, so it never blocks on a key; only a database fault can
 * fail it, and the owner can retry that through F08's route.
 */
@Injectable()
export class ProfileUpdateStageHandler implements PipelineStageHandler, OnModuleInit {
  private readonly logger = new Logger(ProfileUpdateStageHandler.name);
  readonly stage = 'profile_update' as const;
  readonly provider = null;
  readonly retryPolicy = PROFILE_UPDATE_RETRY_POLICY;

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly prisma: PrismaService,
    private readonly pronunciation: PronunciationResultReader,
    private readonly analysis: LessonAnalysisReader,
    private readonly ingestion: ProfileIngestionService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(context: StageRunContext): Promise<void> {
    const { lessonId, userId } = context;
    const [lesson, pronunciation, analysis] = await Promise.all([
      this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { id: true, startedAt: true, openedAt: true } }),
      this.pronunciation.forParticipant(lessonId, userId),
      this.analysis.forParticipant(lessonId, userId),
    ]);
    // A branch only reaches this stage through F10's and F11's completing
    // transactions, so both are unreachable; the runner fails it as
    // `internal_error` once its retries run out.
    if (!pronunciation?.result) {
      throw new Error(`Branch ${context.branchId} reached profile_update without a pronunciation result.`);
    }
    if (!analysis) {
      throw new Error(`Branch ${context.branchId} reached profile_update without an analysis.`);
    }

    const sources = [pronunciationSource(userId, lesson, pronunciation.result), analysisSource(userId, lesson, analysis)];
    let results: IngestionResult[] = [];
    await context.complete(async (tx) => {
      results = await this.ingestion.applySources(tx, sources);
    });
    this.logOutcome(context, sources, results);
  }

  /** Outcomes and rejected tags only — never a quote or a score. */
  private logOutcome(context: StageRunContext, sources: ProfileSourceInput[], results: IngestionResult[]): void {
    const summary = sources
      .map((source, index) => {
        const result = results[index];
        const rejected = result?.rejectedTags.length ? `, rejected ${result.rejectedTags.join(' ')}` : '';
        return `${source.kind} ${result?.outcome ?? 'unknown'}${rejected}`;
      })
      .join('; ');
    this.logger.log(`Profile updated for branch ${context.branchId} (run ${context.run}): ${summary}`);
  }
}
