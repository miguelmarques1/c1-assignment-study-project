import { Injectable } from '@nestjs/common';
import type { ObjectiveAttempt } from '@prisma/client';
import type { ActivityContext, ActivityView, ObjectiveAnswer, ObjectiveView } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { ContentBankService } from '../content/content-bank.service';
import { PlanActivityStateService, type ResolvedActivity } from '../plans/plan-activity-state.service';
import { PlanReadService } from '../plans/plan-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { isObjectiveKind } from './activity.constants';
import { ObjectiveAttemptRepository } from './objective-attempt.repository';
import { grade } from './objective/grading';
import { checkAll, isRunnable } from './objective/question-check';
import { projectQuestion, questionsFingerprint } from './objective/question-projection';
import { resultView } from './objective/result-view';
import { sessionBlock } from './objective/session-context';

/**
 * The read model behind `GET /activities/:activityId` and every action that
 * answers with the activity. It has no side effects. Before a submission it
 * projects the questions without keys, explanations, the listening
 * transcript or the source (A3); after one, it re-grades the stored answers
 * against the attempt's own snapshot, which is deterministic and so reads
 * the same forever (A5).
 */
@Injectable()
export class ActivityViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: PlanActivityStateService,
    private readonly planRead: PlanReadService,
    private readonly content: ContentBankService,
    private readonly attempts: ObjectiveAttemptRepository,
  ) {}

  async viewFor(userId: string, activityId: string, now: Date): Promise<ActivityView> {
    const resolved = await this.state.resolveForOwner(userId, activityId);
    const plan = await this.planRead.planFor(userId, resolved.planId);
    const sessionView = plan.sessions.find((session) => session.day === resolved.day);
    const entry = sessionView?.activities.find((activity) => activity.id === resolved.activityId);
    if (!sessionView || !entry) {
      throw AppError.planActivityNotFound(activityId);
    }

    const activity: ActivityContext = {
      id: resolved.activityId,
      lineage: resolved.lineage,
      planId: resolved.planId,
      planStatus: resolved.planStatus,
      readOnly: resolved.planStatus === 'archived',
      kind: resolved.kind,
      title: entry.title,
      estimatedMinutes: entry.estimatedMinutes,
      targetTags: entry.targetTags,
      rationale: entry.rationale,
      state: entry.state,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      skippedAt: entry.skippedAt,
      skipReason: entry.skipReason,
      rating: entry.rating,
      notUseful: entry.notUseful,
      planCompletionPercent: plan.progress.completionPercent,
    };

    return {
      serverTime: now.toISOString(),
      activity,
      session: sessionBlock(sessionView, resolved.activityId),
      objective: isObjectiveKind(resolved.kind) ? await this.objectiveFor(resolved) : null,
    };
  }

  private async objectiveFor(resolved: ResolvedActivity): Promise<ObjectiveView> {
    if (!resolved.contentItemId) {
      throw AppError.contentItemNotFound('');
    }
    const payload = await this.content.getPayload(resolved.contentItemId);
    const attempt = await this.attempts.currentInLineage(this.prisma, resolved.lineage);
    const submitted = attempt?.status === 'submitted';

    const questions = attempt?.questions ?? payload.questions;
    const checks = checkAll(questions);

    let passage: ObjectiveView['item']['passage'] = null;
    if (payload.body) {
      if (payload.type !== 'listening') {
        passage = { kind: 'text', text: payload.body };
      } else if (submitted) {
        passage = { kind: 'transcript', text: payload.body };
      }
    }

    return {
      runnable: isRunnable(checks),
      item: {
        type: payload.type,
        title: payload.title,
        topic: payload.topic,
        cefrLevel: payload.cefrLevel,
        accent: payload.accent,
        durationSeconds: payload.durationSeconds,
        passage,
        hasAudio: payload.type === 'listening' && payload.mediaObjectKey !== null,
        source: submitted && payload.sourceName ? { name: payload.sourceName, url: payload.sourceUrl } : null,
        questionsFingerprint: attempt?.questionsFingerprint ?? questionsFingerprint(payload.questions),
        questions: checks.map(projectQuestion),
      },
      attempt: attempt
        ? {
            id: attempt.id,
            status: submitted ? 'submitted' : 'open',
            startedAt: attempt.startedAt.toISOString(),
            submittedAt: attempt.submittedAt?.toISOString() ?? null,
          }
        : null,
      result: attempt && submitted ? this.resultOf(attempt, checks) : null,
    };
  }

  private resultOf(attempt: ObjectiveAttempt, checks: ReturnType<typeof checkAll>): ObjectiveView['result'] {
    const answers = (attempt.answers ?? []) as unknown as ObjectiveAnswer[];
    return resultView(checks, answers, grade(checks, answers), {
      timeSpentSeconds: attempt.timeSpentSeconds,
      submittedAt: attempt.submittedAt ?? attempt.updatedAt,
    });
  }
}
