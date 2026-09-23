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
    const ownLabel = existing?.roleLabel ?? (await this.pickFreeLabel(lessonId, userId, roles));
    if (!ownLabel) {
      // More registered participants than roles — should never happen since
      // roles.length === lessons.max_participants, but generating no card is
      // safer than assigning a label that collides with someone else's.
      return;
    }

    await this.prisma.lessonRoleCard.upsert({
      where: { lessonId_userId: { lessonId, userId } },
      create: { lessonId, userId, roleLabel: ownLabel, status: 'pending' },
      update: { roleLabel: ownLabel, status: 'pending' },
    });

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

  private async pickFreeLabel(
    lessonId: string,
    userId: string,
    roles: Array<{ label: string; relationship: string }>,
  ): Promise<string | null> {
    const taken = await this.prisma.lessonRoleCard.findMany({
      where: { lessonId, userId: { not: userId }, roleLabel: { not: null } },
      select: { roleLabel: true },
    });
    const takenLabels = new Set(taken.map((row) => row.roleLabel));
    const free = roles.map((role) => role.label).filter((label) => !takenLabels.has(label));

    if (free.length === 0) {
      return null;
    }
    return free[Math.floor(Math.random() * free.length)]!;
  }
}
