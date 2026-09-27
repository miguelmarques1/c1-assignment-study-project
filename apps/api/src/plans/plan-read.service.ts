import { Injectable } from '@nestjs/common';
import type {
  CurrentPlanView,
  DifficultyRating,
  PlanActivityKind,
  PlanActivityState,
  PlanActivityView,
  PlanNote,
  PlanRatingCounts,
  PlanSessionState,
  PlanSessionView,
  PlanTag,
  StudyPlanOrigin,
  StudyPlanStatus,
  StudyPlanView,
} from '@english-quest/shared';
import type { Prisma, StudyPlanActivity } from '@prisma/client';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { ErrorTaxonomyService } from '../taxonomy/error-taxonomy.service';
import { outranks, precedenceOf, type Precedence } from './composition/precedence';
import { formatSummaryLine } from './composition/summary-line';
import { planFailureMessage } from './plan.constants';
import { PlanRepository } from './plan.repository';

type PlanWithActivities = Prisma.StudyPlanGetPayload<{ include: { activities: true } }>;

const DONE_STATES = new Set(['completed', 'skipped']);

interface BuildCandidate {
  kind: 'preparing' | 'failure';
  lessonId: string;
  origin: StudyPlanOrigin;
  precedence: Precedence;
  since: Date;
  progress: { done: number; total: number } | null;
  failedAt: Date;
}

/**
 * Maps stored plan and activity rows to the client-facing views (spec §5).
 * Every internal/curator field (`composition`, `deterministicReason`,
 * `promptId`/`promptVersion`/`model`, `modelSelectionStats`,
 * `generationRunId`, the rules and taxonomy versions) is deliberately left
 * out — F13's "no admin UI, no browsing interface" precedent.
 */
@Injectable()
export class PlanReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PlanRepository,
    private readonly taxonomy: ErrorTaxonomyService,
  ) {}

  async currentFor(userId: string, now: Date): Promise<CurrentPlanView> {
    const active = await this.repository.findActive(this.prisma, userId);
    const plan = active ? this.toStudyPlanView(active) : null;

    const candidates = [...(await this.pipelineCandidates(userId)), ...(await this.requestCandidates(userId))];
    let chosen: BuildCandidate | null = null;
    for (const candidate of candidates) {
      if (!chosen || outranks(candidate.precedence, chosen.precedence)) {
        chosen = candidate;
      }
    }

    return {
      serverTime: now.toISOString(),
      plan,
      preparing:
        chosen?.kind === 'preparing'
          ? { lessonId: chosen.lessonId, origin: chosen.origin, since: chosen.since.toISOString(), progress: chosen.progress }
          : null,
      failure:
        chosen?.kind === 'failure'
          ? {
              lessonId: chosen.lessonId,
              origin: chosen.origin,
              failedAt: chosen.failedAt.toISOString(),
              message: planFailureMessage(plan !== null),
              retryable: true,
            }
          : null,
    };
  }

  async planFor(userId: string, planId: string): Promise<StudyPlanView> {
    const plan = await this.repository.planForOwner(userId, planId);
    if (!plan) {
      throw AppError.studyPlanNotFound();
    }
    return this.toStudyPlanView(plan);
  }

  private labelOf = (tag: string): string => this.taxonomy.labelOf(tag);

  private toTag(tag: string): PlanTag {
    return { tag, label: this.labelOf(tag) };
  }

  private toStudyPlanView(plan: PlanWithActivities): StudyPlanView {
    const sessions = this.toSessions(plan.activities);
    const total = plan.activities.length;
    const completed = plan.activities.filter((a) => a.state === 'completed').length;
    const skipped = plan.activities.filter((a) => a.state === 'skipped').length;
    const inProgress = plan.activities.filter((a) => a.state === 'in_progress').length;
    const pending = plan.activities.filter((a) => a.state === 'pending').length;
    const doneCount = completed + skipped;

    return {
      id: plan.id,
      status: plan.status as StudyPlanStatus,
      origin: plan.origin as StudyPlanOrigin,
      lessonId: plan.lessonId,
      lessonDate: plan.precedenceAt.toISOString(),
      createdAt: plan.createdAt.toISOString(),
      activatedAt: plan.activatedAt?.toISOString() ?? null,
      archivedAt: plan.archivedAt?.toISOString() ?? null,
      summaryLine: formatSummaryLine(7, total, plan.focusTags.map(this.labelOf), plan.generalMaterial),
      focusTags: plan.focusTags.map((tag) => this.toTag(tag)),
      notes: plan.notes as PlanNote[],
      progress: { total, completed, skipped, inProgress, pending, completionPercent: total > 0 ? Math.floor((100 * doneCount) / total) : 0 },
      ratings: this.ratingsOf(plan.activities),
      sessions,
    };
  }

  private ratingsOf(activities: readonly StudyPlanActivity[]): PlanRatingCounts {
    const completed = activities.filter((a) => a.state === 'completed');
    return {
      tooEasy: completed.filter((a) => a.difficultyRating === 'too_easy').length,
      justRight: completed.filter((a) => a.difficultyRating === 'just_right').length,
      tooHard: completed.filter((a) => a.difficultyRating === 'too_hard').length,
      notUseful: completed.filter((a) => a.notUseful).length,
    };
  }

  private toSessions(activities: readonly StudyPlanActivity[]): StudyPlanView['sessions'] {
    const byDay = new Map<number, StudyPlanActivity[]>();
    for (const activity of activities) {
      const list = byDay.get(activity.day) ?? [];
      list.push(activity);
      byDay.set(activity.day, list);
    }

    const sessions: PlanSessionView[] = [];
    for (let day = 1; day <= 7; day += 1) {
      const dayActivities = (byDay.get(day) ?? []).sort((a, b) => a.position - b.position);
      const estimatedMinutes = dayActivities.reduce((sum, a) => sum + a.estimatedMinutes, 0);
      const state: PlanSessionState =
        dayActivities.length === 0
          ? 'not_started'
          : dayActivities.every((a) => a.state === 'pending')
            ? 'not_started'
            : dayActivities.every((a) => DONE_STATES.has(a.state))
              ? 'completed'
              : 'in_progress';
      const completedAt =
        state === 'completed'
          ? dayActivities.reduce<Date | null>((latest, a) => {
              const at = a.completedAt ?? a.skippedAt;
              return at && (!latest || at > latest) ? at : latest;
            }, null)
          : null;

      sessions.push({
        day,
        estimatedMinutes: estimatedMinutes || 1,
        state,
        completedAt: completedAt?.toISOString() ?? null,
        summary: this.sessionSummaryOf(dayActivities),
        activities: dayActivities.map((activity) => this.toActivityView(activity)),
      });
    }
    return sessions;
  }

  private sessionSummaryOf(activities: readonly StudyPlanActivity[]): PlanSessionView['summary'] {
    const completed = activities.filter((a) => a.state === 'completed');
    const skipped = activities.filter((a) => a.state === 'skipped').length;
    const scored = completed.filter((a) => a.scoreTotal !== null);
    const timeTracked = completed.filter((a) => a.timeSpentSeconds !== null);
    return {
      completed: completed.length,
      skipped,
      correct: scored.length > 0 ? scored.reduce((sum, a) => sum + (a.scoreCorrect ?? 0), 0) : null,
      questions: scored.length > 0 ? scored.reduce((sum, a) => sum + (a.scoreTotal ?? 0), 0) : null,
      timeSpentSeconds: timeTracked.length > 0 ? timeTracked.reduce((sum, a) => sum + (a.timeSpentSeconds ?? 0), 0) : null,
    };
  }

  private toActivityView(activity: StudyPlanActivity): PlanActivityView {
    return {
      id: activity.id,
      day: activity.day,
      position: activity.position,
      kind: activity.kind as PlanActivityKind,
      contentItemId: activity.contentItemId,
      title: activity.title,
      estimatedMinutes: activity.estimatedMinutes,
      targetTags: activity.targetTags.map((tag) => this.toTag(tag)),
      rationale: activity.rationale,
      isReview: activity.isReview,
      carriedOver: activity.carriedFromActivityId !== null,
      state: activity.state as PlanActivityState,
      startedAt: activity.startedAt?.toISOString() ?? null,
      completedAt: activity.completedAt?.toISOString() ?? null,
      skippedAt: activity.skippedAt?.toISOString() ?? null,
      skipReason: activity.skipReason,
      rating: activity.difficultyRating as DifficultyRating | null,
      notUseful: activity.notUseful,
    };
  }

  /** Branches whose analysis completed but whose `plan_generation` row is not yet `completed` (spec §5 "How preparing and failure are derived"). */
  private async pipelineCandidates(userId: string): Promise<BuildCandidate[]> {
    const branches = await this.prisma.lessonPipelineBranch.findMany({
      where: { userId, stages: { some: { stage: 'lesson_analysis', status: 'completed' } } },
      select: {
        lessonId: true,
        lesson: { select: { startedAt: true, openedAt: true } },
        stages: { where: { stage: { in: ['lesson_analysis', 'plan_generation'] } } },
      },
    });

    const candidates: BuildCandidate[] = [];
    for (const branch of branches) {
      const planGeneration = branch.stages.find((stage) => stage.stage === 'plan_generation');
      if (planGeneration?.status === 'completed') {
        continue;
      }
      const lessonTime = branch.lesson.startedAt ?? branch.lesson.openedAt;
      const precedence = precedenceOf(lessonTime, 'lesson');
      if (planGeneration?.status === 'failed') {
        candidates.push({
          kind: 'failure',
          lessonId: branch.lessonId,
          origin: 'lesson',
          precedence,
          since: planGeneration.finishedAt ?? lessonTime,
          progress: null,
          failedAt: planGeneration.finishedAt ?? lessonTime,
        });
        continue;
      }
      const analysis = branch.stages.find((stage) => stage.stage === 'lesson_analysis');
      candidates.push({
        kind: 'preparing',
        lessonId: branch.lessonId,
        origin: 'lesson',
        precedence,
        since: analysis?.finishedAt ?? lessonTime,
        progress:
          planGeneration?.progressDone !== null && planGeneration?.progressTotal !== null && planGeneration !== undefined
            ? { done: planGeneration.progressDone!, total: planGeneration.progressTotal! }
            : null,
        failedAt: lessonTime,
      });
    }
    return candidates;
  }

  private async requestCandidates(userId: string): Promise<BuildCandidate[]> {
    const requests = await this.prisma.studyPlanRequest.findMany({
      where: { userId, status: { notIn: ['completed', 'superseded'] } },
      include: { lesson: { select: { startedAt: true, openedAt: true } } },
    });
    return requests.map((request): BuildCandidate => {
      const lessonTime = request.lesson.startedAt ?? request.lesson.openedAt;
      const precedence = precedenceOf(lessonTime, request.origin as StudyPlanOrigin);
      return {
        kind: request.status === 'failed' ? 'failure' : 'preparing',
        lessonId: request.lessonId,
        origin: request.origin as StudyPlanOrigin,
        precedence,
        since: request.createdAt,
        progress:
          request.progressDone !== null && request.progressTotal !== null
            ? { done: request.progressDone, total: request.progressTotal }
            : null,
        failedAt: request.finishedAt ?? request.updatedAt,
      };
    });
  }
}
