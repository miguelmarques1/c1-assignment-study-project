import { Injectable } from '@nestjs/common';
import type { Lesson } from '@prisma/client';
import type {
  Register,
  Role,
  RoleCardStatus,
  ScenarioStatus,
  ScenarioView,
  VocabularyDomain,
} from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { CLASSROOM_ROOM_NAME } from '../classroom/classroom.constants';
import { PrismaService } from '../prisma/prisma.service';
import { REROLL_LIMIT } from './scenario.constants';
import { ScenarioOrchestratorService } from './scenario-orchestrator.service';

const OPEN_STATUSES = ['waiting', 'live'] as const;

/**
 * The policy layer in front of `ScenarioOrchestratorService`: who may read,
 * reroll or retry, how many times, and the point after which the scenario
 * can no longer change. The orchestrator only knows how to regenerate; this
 * service decides whether it is allowed to right now.
 *
 * Not named in the spec's Component Overview — added so `ScenarioController`
 * stays a thin adapter, matching `ClassroomController` / `ClassroomService`
 * and every other controller in this codebase.
 */
@Injectable()
export class ScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ScenarioOrchestratorService,
  ) {}

  async read(userId: string): Promise<ScenarioView> {
    const lesson = await this.findOpenLesson();
    if (!lesson) {
      return null;
    }
    return this.buildView(lesson, userId);
  }

  async reroll(userId: string): Promise<ScenarioView> {
    const lesson = await this.requireOpenLesson();
    this.requireOpener(lesson, userId);
    this.requireNotStarted(lesson);

    const scenario = await this.prisma.lessonScenario.findUnique({ where: { lessonId: lesson.id } });
    if (scenario && scenario.rerollCount >= REROLL_LIMIT) {
      throw AppError.rerollLimitReached(REROLL_LIMIT);
    }

    await this.orchestrator.reroll(lesson);
    return this.buildView(lesson, userId);
  }

  async retry(userId: string): Promise<ScenarioView> {
    const lesson = await this.requireOpenLesson();
    this.requireOpener(lesson, userId);
    this.requireNotStarted(lesson);

    await this.orchestrator.retry(lesson);
    return this.buildView(lesson, userId);
  }

  private requireOpener(lesson: Lesson, userId: string): void {
    if (lesson.openedBy !== userId) {
      throw AppError.notTheOpener();
    }
  }

  private requireNotStarted(lesson: Lesson): void {
    if (lesson.startedAt) {
      throw AppError.scenarioLocked();
    }
  }

  private findOpenLesson(): Promise<Lesson | null> {
    return this.prisma.lesson.findFirst({
      where: { room: CLASSROOM_ROOM_NAME, status: { in: [...OPEN_STATUSES] } },
    });
  }

  private async requireOpenLesson(): Promise<Lesson> {
    const lesson = await this.findOpenLesson();
    if (!lesson) {
      throw AppError.lessonNotActive();
    }
    return lesson;
  }

  /**
   * Scoped at the source: this method reads only the caller's own
   * `lesson_role_cards` row. There is no code path here that ever loads
   * another participant's card, so there is no response shape it could leak
   * through.
   */
  private async buildView(lesson: Lesson, userId: string): Promise<ScenarioView> {
    const [scenario, card] = await Promise.all([
      this.prisma.lessonScenario.findUnique({ where: { lessonId: lesson.id } }),
      this.prisma.lessonRoleCard.findUnique({ where: { lessonId_userId: { lessonId: lesson.id, userId } } }),
    ]);

    const status = (scenario?.status ?? 'pending') as ScenarioStatus;
    const rerollCount = scenario?.rerollCount ?? 0;

    return {
      lessonId: lesson.id,
      status,
      situation:
        status === 'ready' && scenario
          ? {
              title: scenario.title,
              setting: scenario.setting!,
              premise: scenario.premise!,
              roles: scenario.roles as unknown as Role[],
              vocabularyDomain: scenario.vocabularyDomain as VocabularyDomain,
              discussionHooks: scenario.discussionHooks as unknown as string[],
            }
          : null,
      rerollsRemaining: Math.max(REROLL_LIMIT - rerollCount, 0),
      canReroll: !lesson.startedAt && lesson.openedBy === userId && rerollCount < REROLL_LIMIT,
      myRoleLabel: card?.roleLabel ?? null,
      myCard: card
        ? {
            status: card.status as RoleCardStatus,
            background: card.background,
            objective: card.objective,
            constraint: card.constraintText,
            register: card.register as Register | null,
            targetExpressions: card.targetExpressions as unknown as string[] | null,
          }
        : null,
    };
  }
}
