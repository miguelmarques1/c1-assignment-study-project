import { Injectable } from '@nestjs/common';
import type { SpeakingTask } from '@prisma/client';
import type { DifficultyRating, SpeakingActivityKind, SpeakingActivityView, SpeakingRatingInput, SpeakingRatingView } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { CredentialsService } from '../credentials/credentials.service';
import { PlanActivityStateService } from '../plans/plan-activity-state.service';
import { PlanRepository } from '../plans/plan.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorLedgerReader } from '../profile/error-ledger.reader';
import { SpeakingCorpusService } from './corpus/speaking-corpus.service';
import { selectOpenResponse, selectReadAloud } from './selection/task-selector';
import { SpeakingAttemptRepository } from './speaking-attempt.repository';
import { SpeakingTaskRepository, type NewSpeakingTaskRow } from './speaking-task.repository';
import { SpeakingViewMapper } from './speaking-view.mapper';
import { SPEAKING_ACTIVITY_KINDS } from './speaking.constants';

/**
 * Route logic behind reading and rating a speaking activity: resolving it
 * through F15's carry-over contract, materializing its task once (A19), and
 * mapping everything to the caller's own view.
 */
@Injectable()
export class SpeakingActivityService {
  constructor(
    private readonly planActivityState: PlanActivityStateService,
    private readonly planRepository: PlanRepository,
    private readonly taskRepository: SpeakingTaskRepository,
    private readonly attemptRepository: SpeakingAttemptRepository,
    private readonly corpus: SpeakingCorpusService,
    private readonly ledger: ErrorLedgerReader,
    private readonly credentials: CredentialsService,
    private readonly mapper: SpeakingViewMapper,
    private readonly prisma: PrismaService,
  ) {}

  async viewFor(userId: string, activityId: string, now: Date): Promise<SpeakingActivityView> {
    const resolved = await this.planActivityState.resolveForOwner(userId, activityId);
    if (!SPEAKING_ACTIVITY_KINDS.has(resolved.kind)) {
      throw AppError.speakingActivityNotFound();
    }
    const activityRow = await this.planRepository.activityById(this.prisma, resolved.activityId);
    if (!activityRow) {
      throw AppError.planActivityNotFound(activityId);
    }

    const rootActivityId = resolved.lineage[0]!;
    let task = await this.taskRepository.findByRoot(this.prisma, rootActivityId);
    if (!task && resolved.planStatus !== 'archived') {
      task = await this.materializeTask(userId, resolved.kind as SpeakingActivityKind, resolved.targetTags, rootActivityId);
    }

    const attempts = task ? await this.attemptRepository.forTask(this.prisma, task.id) : [];
    const azureStatus = (await this.credentials.list(userId)).find((entry) => entry.provider === 'azure_speech')?.status ?? 'missing';

    return this.mapper.toActivityView({
      activityId: resolved.activityId,
      kind: resolved.kind as SpeakingActivityKind,
      title: activityRow.title,
      state: resolved.state,
      planStatus: resolved.planStatus,
      estimatedMinutes: resolved.estimatedMinutes,
      targetTags: resolved.targetTags,
      task,
      azureStatus,
      attempts,
      rating: activityRow.ratedAt
        ? { rating: activityRow.difficultyRating as DifficultyRating | null, notUseful: activityRow.notUseful }
        : null,
      now,
    });
  }

  async rate(userId: string, activityId: string, input: SpeakingRatingInput): Promise<SpeakingRatingView> {
    const resolved = await this.planActivityState.resolveForOwner(userId, activityId);
    if (!SPEAKING_ACTIVITY_KINDS.has(resolved.kind)) {
      throw AppError.speakingActivityNotFound();
    }
    await this.planActivityState.recordRating(userId, activityId, { rating: input.rating, notUseful: input.notUseful });
    return { rating: input.rating, notUseful: input.notUseful };
  }

  /** One task per carry-over lineage (A9), chosen deterministically from the corpus in force (A4). */
  private async materializeTask(
    userId: string,
    kind: SpeakingActivityKind,
    targetTags: readonly string[],
    rootActivityId: string,
  ): Promise<SpeakingTask> {
    const corpus = this.corpus.current();
    const usage = await this.taskRepository.usageFor(userId);
    const now = new Date();

    let row: NewSpeakingTaskRow;
    if (kind === 'pronunciation') {
      const unmasteredPhonemes = (await this.ledger.unmasteredTags(userId)).filter((tag) => tag.startsWith('phoneme:'));
      const selection = selectReadAloud(corpus.readAloud, { targetTags, unmasteredPhonemes, usage, now });
      const entry = corpus.readAloud.find((candidate) => candidate.id === selection.entryId)!;
      row = {
        userId,
        rootActivityId,
        shape: 'read_aloud',
        corpusEntryId: entry.id,
        corpusVersion: corpus.version,
        corpusFingerprint: corpus.fingerprint,
        referenceText: entry.text,
        promptText: null,
        hint: null,
        targetTags: [...targetTags],
        focusTags: selection.focusTags,
      };
    } else {
      const selection = selectOpenResponse(corpus.openResponse, { targetTags, usage, now });
      const entry = corpus.openResponse.find((candidate) => candidate.id === selection.entryId)!;
      row = {
        userId,
        rootActivityId,
        shape: 'open_response',
        corpusEntryId: entry.id,
        corpusVersion: corpus.version,
        corpusFingerprint: corpus.fingerprint,
        referenceText: null,
        promptText: entry.prompt,
        hint: entry.hint,
        targetTags: [...targetTags],
        focusTags: selection.focusTags,
      };
    }

    return this.taskRepository.insertIfAbsent(this.prisma, row);
  }
}
