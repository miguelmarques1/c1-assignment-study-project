import { Injectable } from '@nestjs/common';
import type { StudyPlanOrigin } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';
import { atLeast, precedenceOf } from './composition/precedence';
import { PlanRepository } from './plan.repository';

export type SupersessionReason = 'plan_exists' | 'newer_lesson';

/**
 * Skips a build before anything is spent on it — no F14 run, no model call
 * — when an existing plan already outranks it, or a newer lesson of this
 * user already has (or is certain to get) its own plan (spec A2). Only a
 * true race, where two builds pass this check at nearly the same moment,
 * reaches the PRD's "created and immediately archived" outcome instead.
 */
@Injectable()
export class PlanSupersessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: PlanRepository,
  ) {}

  /** `now` is accepted for interface symmetry with the composer and isn't needed today: every check compares fixed lesson times. */
  async isSuperseded(userId: string, lessonId: string, origin: StudyPlanOrigin, _now: Date): Promise<SupersessionReason | null> {
    const lesson = await this.prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      select: { startedAt: true, openedAt: true },
    });
    const lessonTime = lesson.startedAt ?? lesson.openedAt;
    const build = precedenceOf(lessonTime, origin);

    const existingPlans = await this.repository.allPrecedence(this.prisma, userId);
    for (const plan of existingPlans) {
      if (atLeast(precedenceOf(plan.precedenceAt, plan.origin as StudyPlanOrigin), build)) {
        return 'plan_exists';
      }
    }

    const laterAnalysed = await this.prisma.profileSource.findFirst({
      where: {
        userId,
        kind: 'lesson_analysis',
        lesson: { OR: [{ startedAt: { gt: lessonTime } }, { startedAt: null, openedAt: { gt: lessonTime } }] },
      },
      select: { id: true },
    });
    if (laterAnalysed) {
      return 'newer_lesson';
    }

    const laterRequest = await this.prisma.studyPlanRequest.findFirst({
      where: {
        userId,
        status: { not: 'failed' },
        lesson: { OR: [{ startedAt: { gt: lessonTime } }, { startedAt: null, openedAt: { gt: lessonTime } }] },
      },
      select: { id: true },
    });
    return laterRequest ? 'newer_lesson' : null;
  }
}
