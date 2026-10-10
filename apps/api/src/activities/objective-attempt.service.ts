import { Injectable, Logger } from '@nestjs/common';
import type { ActivityView, ObjectiveSubmissionInput } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { ContentBankService } from '../content/content-bank.service';
import { PlanActivityStateService } from '../plans/plan-activity-state.service';
import { PlanRepository } from '../plans/plan.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileIngestionService } from '../profile/profile-ingestion.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { ActivityViewService } from './activity-view.service';
import { isObjectiveKind, SUBMISSION_TRANSACTION_TIMEOUT_MS, TIME_SPENT_MAX_SECONDS, type ObjectiveKind } from './activity.constants';
import { ObjectiveAttemptRepository } from './objective-attempt.repository';
import { answerIssues, grade } from './objective/grading';
import { buildActivityOutcome } from './objective/objective-outcome';
import { checkAll, isRunnable } from './objective/question-check';
import { questionsFingerprint } from './objective/question-projection';

/**
 * Starting and submitting an objective attempt. Both take F15's per-user
 * plan lock first (A10), so a submission and a plan activation can never
 * interleave. The attempt id is the idempotency key of all three writes:
 * this row, F12's `sourceKey` and F15's `completionKey` (A8).
 */
@Injectable()
export class ObjectiveAttemptService {
  private readonly logger = new Logger(ObjectiveAttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planRepository: PlanRepository,
    private readonly state: PlanActivityStateService,
    private readonly content: ContentBankService,
    private readonly attempts: ObjectiveAttemptRepository,
    private readonly ingestion: ProfileIngestionService,
    private readonly taxonomy: ErrorTaxonomyService,
    private readonly views: ActivityViewService,
  ) {}

  /** Idempotent: an existing attempt in the lineage is returned as it is (A4). */
  async start(userId: string, activityId: string, now: Date): Promise<ActivityView> {
    await this.prisma.$transaction(async (tx) => {
      await this.planRepository.lock(tx, userId);
      const resolved = await this.state.resolveForOwner(userId, activityId, tx);
      if (!isObjectiveKind(resolved.kind)) {
        throw AppError.activityNotObjective();
      }
      if (resolved.state === 'skipped') {
        throw AppError.activitySkipped();
      }
      // An attempt already underway (or graded) is returned even on an archived plan, so it can still be submitted (A9).
      if (await this.attempts.currentInLineage(tx, resolved.lineage)) {
        return;
      }
      if (resolved.planStatus === 'archived') {
        throw AppError.planActivityNotInCurrentPlan(resolved.activityId);
      }
      if (!resolved.contentItemId) {
        throw AppError.contentItemNotFound('');
      }
      const payload = await this.content.getPayload(resolved.contentItemId);
      if (!isRunnable(checkAll(payload.questions))) {
        throw AppError.activityNotRunnable();
      }
      await this.attempts.insert(tx, {
        userId,
        planActivityId: resolved.activityId,
        contentItemId: payload.id,
        kind: resolved.kind,
        provenance: payload.provenance,
        promptId: payload.promptId,
        promptVersion: payload.promptVersion,
        questions: payload.questions,
        questionsFingerprint: questionsFingerprint(payload.questions),
        startedAt: now,
      });
      await this.state.markStarted(userId, resolved.activityId, { at: now }, tx);
    });
    return this.views.viewFor(userId, activityId, now);
  }

  /** The first submission is graded and stored; any repeat returns the stored result unchanged (A8). */
  async submit(userId: string, activityId: string, attemptId: string, input: ObjectiveSubmissionInput, now: Date): Promise<ActivityView> {
    await this.prisma.$transaction(
      async (tx) => {
        await this.planRepository.lock(tx, userId);
        const resolved = await this.state.resolveForOwner(userId, activityId, tx);
        if (!isObjectiveKind(resolved.kind)) {
          throw AppError.activityNotObjective();
        }
        const attempt = await this.attempts.lockForSubmission(tx, attemptId, userId, resolved.lineage);
        if (!attempt) {
          throw AppError.activityAttemptNotFound();
        }
        if (attempt.status === 'submitted') {
          return;
        }
        if (attempt.status === 'abandoned') {
          throw AppError.activitySkipped();
        }
        if (input.questionsFingerprint !== attempt.questionsFingerprint) {
          throw AppError.validationFailed([{ path: 'questionsFingerprint', message: 'does not match this attempt' }]);
        }

        const checks = checkAll(attempt.questions);
        const issues = answerIssues(checks, input.answers);
        if (issues.length > 0) {
          throw AppError.validationFailed(issues);
        }
        const graded = grade(checks, input.answers);
        const timeSpentSeconds = Math.min(Math.max(Math.trunc(input.timeSpentSeconds), 0), TIME_SPENT_MAX_SECONDS);
        const item = await this.content.getPayload(attempt.contentItemId);

        await this.attempts.markSubmitted(tx, attempt.id, {
          answers: input.answers,
          results: graded.results,
          scoreCorrect: graded.scoreCorrect,
          scoreTotal: graded.scoreTotal,
          unscoredCount: graded.unscoredCount,
          timeSpentSeconds,
          submittedAt: now,
        });

        await this.ingestion.ingestActivityOutcome(
          buildActivityOutcome({
            userId,
            activityId: resolved.activityId,
            attemptId: attempt.id,
            kind: attempt.kind as ObjectiveKind,
            targetTags: item.targetTags,
            checks,
            answers: input.answers,
            graded,
            occurredAt: now,
            familyOf: (tag) => this.taxonomy.familyOf(tag),
          }),
          tx,
        );

        // A replaced plan keeps the evidence but cannot be completed (A9).
        if (resolved.planStatus === 'active') {
          await this.state.markCompleted(
            userId,
            resolved.activityId,
            {
              completionKey: attempt.id,
              completedAt: now,
              scoreCorrect: graded.scoreCorrect,
              scoreTotal: graded.scoreTotal,
              timeSpentSeconds,
            },
            tx,
          );
        }

        for (const result of graded.results) {
          if (result.unscoredReason === 'answer_key_invalid') {
            this.logger.warn(`item ${item.id} (${item.slug}) question ${result.index + 1} could not be corrected: ${result.issues.join('; ')}`);
          }
        }
        this.logger.log(
          `attempt ${attempt.id} activity ${resolved.activityId} item ${item.slug} kind ${attempt.kind} score ${graded.scoreCorrect}/${graded.scoreTotal} unscored ${graded.unscoredCount}`,
        );
      },
      { timeout: SUBMISSION_TRANSACTION_TIMEOUT_MS },
    );
    return this.views.viewFor(userId, activityId, now);
  }
}
