import { Injectable } from '@nestjs/common';
import type { Lesson } from '@prisma/client';
import type { LessonScenarioStatus, LessonScenarioView, ScenarioStatus, ScenarioView } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { CLASSROOM_ROOM_NAME } from '../classroom/classroom.constants';
import { LessonAccessService } from '../pipeline/lesson-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { REROLL_LIMIT } from './scenario.constants';
import { ScenarioOrchestratorService } from './scenario-orchestrator.service';
import { ownCardOf, situationOf } from './scenario-view';

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
    private readonly access: LessonAccessService,
  ) {}

  async read(userId: string): Promise<ScenarioView> {
    const lesson = await this.findOpenLesson();
    if (!lesson) {
      return null;
    }
    return this.buildView(lesson, userId);
  }

  /**
   * A past lesson's scenario, as it was on screen before the lesson (F19):
   * the full situation and the caller's own card only. The scenario is
   * immutable once the lesson starts, so there is nothing to reroll here.
   */
  async readForLesson(lessonId: string, userId: string): Promise<LessonScenarioView> {
    await this.access.requireParticipant(lessonId, userId);
    const [scenario, card] = await Promise.all([
      this.prisma.lessonScenario.findUnique({ where: { lessonId } }),
      this.prisma.lessonRoleCard.findUnique({ where: { lessonId_userId: { lessonId, userId } } }),
    ]);
    return {
      lessonId,
      status: (scenario?.status ?? 'none') as LessonScenarioStatus,
      situation: situationOf(scenario),
      myRoleLabel: card?.roleLabel ?? null,
      myCard: ownCardOf(card),
    };
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
      situation: situationOf(scenario),
      rerollsRemaining: Math.max(REROLL_LIMIT - rerollCount, 0),
      canReroll: !lesson.startedAt && lesson.openedBy === userId && rerollCount < REROLL_LIMIT,
      myRoleLabel: card?.roleLabel ?? null,
      myCard: ownCardOf(card),
    };
  }
}
