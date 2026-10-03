import { Injectable, Logger } from '@nestjs/common';
import { countWords, WRITING_MAX_SUBMIT_WORDS, WRITING_MIN_SUBMIT_WORDS, type WritingActivityView } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { CredentialsService } from '../credentials/credentials.service';
import { PrismaService } from '../prisma/prisma.service';
import { WritingCorrectionRunner } from './correction/writing-correction.runner';
import { WritingActivityService } from './writing-activity.service';
import { limitState, limitWindowStart } from './writing-limit';
import { resolveWritingActivity } from './writing-resolve';
import { WritingRepository } from './writing.repository';
import { PlanActivityStateService } from '../plans/plan-activity-state.service';

const SUBMITTABLE_STATUSES = new Set(['draft', 'uncorrected', 'correction_failed']);

export interface SubmitWritingInput {
  submissionId: string;
  baseRevision: number;
}

/**
 * Route logic for `POST …/writing/submit` (spec §5). Runs the checks in
 * the given order, enforces the rolling daily limit under a per-user
 * advisory lock, creates the correction, moves the task to `correcting`,
 * and starts the runner without awaiting it. The final view is always
 * built by `WritingActivityService.read`, so a submission's response is
 * never a second, divergent way of assembling the same shape.
 */
@Injectable()
export class WritingSubmissionService {
  private readonly logger = new Logger(WritingSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanActivityStateService,
    private readonly repository: WritingRepository,
    private readonly credentials: CredentialsService,
    private readonly activityService: WritingActivityService,
    private readonly runner: WritingCorrectionRunner,
  ) {}

  async submit(userId: string, activityId: string, input: SubmitWritingInput, now: Date): Promise<WritingActivityView> {
    const resolved = await resolveWritingActivity(this.plans, userId, activityId, this.prisma);
    const task = await this.repository.findTaskByLineage(this.prisma, resolved.lineage);
    if (!task) {
      throw AppError.writingTaskNotStarted();
    }

    const existing = await this.repository.correctionBySubmissionId(this.prisma, task.id, input.submissionId);
    if (existing) {
      return this.activityService.read(userId, activityId, now);
    }

    if (resolved.planStatus === 'archived') {
      throw AppError.planActivityNotInCurrentPlan(activityId);
    }
    if (!SUBMITTABLE_STATUSES.has(task.status)) {
      throw AppError.writingAlreadySubmitted();
    }
    if (input.baseRevision !== task.draftRevision) {
      throw AppError.writingDraftConflict({
        text: task.draftText,
        revision: task.draftRevision,
        savedAt: task.draftSavedAt?.toISOString() ?? null,
      });
    }

    const wordCount = countWords(task.draftText);
    if (wordCount < WRITING_MIN_SUBMIT_WORDS) {
      throw AppError.writingTooShort(wordCount);
    }
    if (wordCount > WRITING_MAX_SUBMIT_WORDS) {
      throw AppError.writingTooLong(wordCount);
    }

    const credentialList = await this.credentials.list(userId);
    const gemini = credentialList.find((credential) => credential.provider === 'gemini');
    const geminiKeyUsable = !!gemini && gemini.status !== 'missing' && gemini.status !== 'invalid';
    if (!geminiKeyUsable) {
      throw AppError.writingGeminiKeyRequired();
    }

    const correctionId = await this.prisma.$transaction(async (tx) => {
      await this.repository.lockUserLimit(tx, userId);

      const requestedAts = await this.repository.requestedAtsSince(tx, userId, limitWindowStart(now));
      const limit = limitState(requestedAts, now);
      if (limit.used >= limit.max) {
        throw AppError.writingDailyLimit({ limit: limit.max, used: limit.used, resetsAt: limit.resetsAt! });
      }

      const locked = (await this.repository.taskForUpdate(tx, task.id))!;
      if (!SUBMITTABLE_STATUSES.has(locked.status)) {
        throw AppError.writingAlreadySubmitted();
      }
      if (locked.draftRevision !== input.baseRevision) {
        throw AppError.writingDraftConflict({
          text: locked.draftText,
          revision: locked.draftRevision,
          savedAt: locked.draftSavedAt?.toISOString() ?? null,
        });
      }

      const created = await this.repository.insertCorrection(tx, {
        taskId: locked.id,
        userId,
        submissionId: input.submissionId,
        draftRevision: locked.draftRevision,
        submittedText: locked.draftText,
        wordCount: countWords(locked.draftText),
        requestedAt: now,
        claimedAt: now,
      });
      await this.repository.setSubmitted(tx, locked.id, now);
      return created.id;
    });

    this.runner.runClaimed(correctionId).catch((error: unknown) => {
      this.logger.error(`Writing correction ${correctionId} failed to start`, error);
    });

    return this.activityService.read(userId, activityId, now);
  }
}
