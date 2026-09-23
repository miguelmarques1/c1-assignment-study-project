import { Injectable } from '@nestjs/common';
import { Prisma, type LessonScenario } from '@prisma/client';
import { roleSchema, type Register } from '@english-quest/shared';
import { z } from 'zod';

import { PrismaService } from '../prisma/prisma.service';
import { PromptExecutionService } from '../prompts/prompt-execution.service';
import { ProfileTagsPort } from './profile-tags.port';

const rolesArraySchema = z.array(roleSchema);

/** The model's raw output shape for `scenario-role-card`, before persistence. */
interface ScenarioRoleCardOutput {
  background: string;
  objective: string;
  constraint: string;
  register: Register;
  target_expressions: string[];
}

/**
 * Owns every write to `lesson_role_cards`. Assigns a random free role label
 * from the shared situation, then generates that participant's private card
 * with their own key — taking the shared situation verbatim, their assigned
 * role, and the other roles' labels only, never another participant's card.
 *
 * Any failure — including the owner having no valid key — leaves the card
 * `failed` rather than blocking the lesson; the role label is persisted
 * first so a failed card still tells its owner which role they are playing.
 */
@Injectable()
export class RoleCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promptExecution: PromptExecutionService,
    private readonly profileTags: ProfileTagsPort,
  ) {}

  /** Idempotent: a card already `ready` for this participant is left alone. */
  async ensureCard(lessonId: string, userId: string, scenario: LessonScenario): Promise<void> {
    const existing = await this.prisma.lessonRoleCard.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
    });
    if (existing?.status === 'ready') {
      return;
    }

    const roles = rolesArraySchema.parse(scenario.roles);
    const ownLabel = await this.claimLabel(lessonId, userId, roles);
    if (!ownLabel) {
      // More registered participants than seats. Recorded as a failed card
      // with no role rather than left pending forever, so the owner sees the
      // card message instead of a spinner that never resolves.
      await this.prisma.lessonRoleCard.upsert({
        where: { lessonId_userId: { lessonId, userId } },
        create: { lessonId, userId, status: 'failed' },
        update: { status: 'failed' },
      });
      return;
    }

    const otherRoleLabels = roles
      .filter((role) => role.label !== ownLabel)
      .map((role) => role.label)
      .join(', ');
    const weaknessTags = await this.profileTags.weaknessTagsFor(userId);

    try {
      const result = await this.promptExecution.execute(userId, 'scenario-role-card', {
        setting: scenario.setting ?? '',
        premise: scenario.premise ?? '',
        vocabulary_domain: scenario.vocabularyDomain ?? '',
        own_role_label: ownLabel,
        other_role_labels: otherRoleLabels,
        weakness_tags: weaknessTags.join(', '),
      });

      const data = result.data as ScenarioRoleCardOutput;
      await this.prisma.lessonRoleCard.update({
        where: { lessonId_userId: { lessonId, userId } },
        data: {
          status: 'ready',
          background: data.background,
          objective: data.objective,
          constraintText: data.constraint,
          register: data.register,
          targetExpressions: data.target_expressions,
          promptId: result.promptId,
          promptVersion: result.promptVersion,
        },
      });
    } catch {
      // Any failure — including the owner having no valid key — leaves the
      // role label in place and only the card content unset.
      await this.prisma.lessonRoleCard.update({
        where: { lessonId_userId: { lessonId, userId } },
        data: { status: 'failed' },
      });
    }
  }

  /** Resets every card for a lesson to `pending`, for a reroll's fresh regeneration. */
  async resetAllForLesson(lessonId: string): Promise<void> {
    await this.prisma.lessonRoleCard.updateMany({
      where: { lessonId },
      data: {
        status: 'pending',
        roleLabel: null,
        background: null,
        objective: null,
        constraintText: null,
        register: null,
        targetExpressions: Prisma.JsonNull,
        promptId: null,
        promptVersion: null,
      },
    });
  }

  /**
   * Assigns this participant a role, once. Serialized per lesson by locking
   * the scenario row: the cards of everyone registered while the situation
   * was generating are produced in parallel, and without the lock two of
   * them would read the same label as free.
   *
   * Among the free roles it prefers any other than the one this participant
   * played in their previous lesson, so neither side is always the same
   * person's; within that preference the draw is random.
   */
  private claimLabel(
    lessonId: string,
    userId: string,
    roles: Array<{ label: string; relationship: string }>,
  ): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM lesson_scenarios WHERE lesson_id = ${lessonId}::uuid FOR UPDATE`;

      const card = await tx.lessonRoleCard.findUnique({
        where: { lessonId_userId: { lessonId, userId } },
      });
      if (card?.roleLabel) {
        await tx.lessonRoleCard.update({ where: { id: card.id }, data: { status: 'pending' } });
        return card.roleLabel;
      }

      const taken = await tx.lessonRoleCard.findMany({
        where: { lessonId, userId: { not: userId }, roleLabel: { not: null } },
        select: { roleLabel: true },
      });
      const takenLabels = new Set(taken.map((row) => row.roleLabel));
      const free = roles
        .map((role, index) => ({ label: role.label, index }))
        .filter((role) => !takenLabels.has(role.label));
      if (free.length === 0) {
        return null;
      }

      const previous = await tx.lessonRoleCard.findFirst({
        where: { userId, lessonId: { not: lessonId }, roleLabel: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { roleLabel: true, lesson: { select: { scenario: { select: { roles: true } } } } },
      });
      const previousRoles = rolesArraySchema.safeParse(previous?.lesson.scenario?.roles);
      const previousIndex = previousRoles.success
        ? previousRoles.data.findIndex((role) => role.label === previous?.roleLabel)
        : -1;

      const preferred = free.filter((role) => role.index !== previousIndex);
      const pool = preferred.length > 0 ? preferred : free;
      const chosen = pool[Math.floor(Math.random() * pool.length)]!;

      await tx.lessonRoleCard.upsert({
        where: { lessonId_userId: { lessonId, userId } },
        create: { lessonId, userId, roleLabel: chosen.label, status: 'pending' },
        update: { roleLabel: chosen.label, status: 'pending' },
      });
      return chosen.label;
    });
  }
}
