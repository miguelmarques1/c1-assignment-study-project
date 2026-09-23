import { Injectable } from '@nestjs/common';
import { Prisma, type Lesson, type LessonScenario } from '@prisma/client';
import { ERROR_CODES, type VocabularyDomain } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { PromptExecutionService } from '../prompts/prompt-execution.service';

/** The model's raw output shape for `scenario-situation`, before persistence. */
interface ScenarioSituationOutput {
  title: string;
  setting: string;
  premise: string;
  roles: Array<{ label: string; relationship: string }>;
  discussion_hooks: string[];
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Owns every write to `lesson_scenarios`. Creates the row the moment the
 * lesson opens — before any model call — so `pending`, `failed` and
 * `no_scenario` are states of a row rather than the absence of one.
 *
 * Purely mechanical: this service does not decide *whether* a caller is
 * allowed to reroll or retry, how many times, or after the lesson starts —
 * those rules live in front of it (see the scenario controller/service).
 */
@Injectable()
export class SituationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promptExecution: PromptExecutionService,
  ) {}

  /** Idempotent: a second call for the same lesson returns the existing row. */
  async ensureScenarioRow(
    lessonId: string,
    generatorUserId: string,
  ): Promise<{ scenario: LessonScenario; created: boolean }> {
    try {
      const scenario = await this.prisma.lessonScenario.create({
        data: { lessonId, status: 'pending', generatedBy: generatorUserId },
      });
      return { scenario, created: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const scenario = await this.prisma.lessonScenario.findUniqueOrThrow({ where: { lessonId } });
        return { scenario, created: false };
      }
      throw error;
    }
  }

  /**
   * Resets an existing scenario to `pending` and clears its content, so a
   * stale `ready` situation is never half-displayed while the new one
   * generates. Does not check the reroll ceiling or the lesson's start time —
   * the caller has already enforced those.
   */
  async beginReroll(lessonId: string): Promise<LessonScenario> {
    return this.prisma.lessonScenario.update({
      where: { lessonId },
      data: {
        status: 'pending',
        title: null,
        setting: null,
        premise: null,
        vocabularyDomain: null,
        roles: Prisma.JsonNull,
        discussionHooks: Prisma.JsonNull,
        generatedBy: null,
        promptId: null,
        promptVersion: null,
        rerollCount: { increment: 1 },
      },
    });
  }

  /**
   * Resets a `failed` scenario to `pending`. Does not consume a reroll — a
   * failed generation produced no situation to replace — and does not touch
   * `reroll_count`. Situation content fields are already null on a `failed`
   * row (only `markReady` ever populates them).
   */
  async beginRetry(lessonId: string): Promise<LessonScenario> {
    return this.prisma.lessonScenario.update({
      where: { lessonId },
      data: { status: 'pending' },
    });
  }

  /**
   * Runs `scenario-situation` with the opener's own key and records the
   * outcome — `ready` on success, `no_scenario` when the opener has no valid
   * key, `failed` for anything else (F04 has already retried the schema
   * validation once by the time this throws).
   */
  async generate(
    lesson: Lesson,
    generatorUserId: string,
    domain: VocabularyDomain,
  ): Promise<LessonScenario> {
    try {
      const result = await this.promptExecution.execute(generatorUserId, 'scenario-situation', {
        participant_count: String(lesson.maxParticipants),
        vocabulary_domain: domain,
      });

      const data = result.data as ScenarioSituationOutput;
      return this.markReady(lesson.id, generatorUserId, domain, data, result.promptId, result.promptVersion);
    } catch (error) {
      if (this.isMissingKey(error)) {
        return this.markNoScenario(lesson.id);
      }
      return this.markFailed(lesson.id);
    }
  }

  private isMissingKey(error: unknown): boolean {
    return (
      error instanceof AppError &&
      (error.code === ERROR_CODES.CREDENTIAL_UNAVAILABLE || error.code === ERROR_CODES.CREDENTIAL_UNREADABLE)
    );
  }

  private markNoScenario(lessonId: string): Promise<LessonScenario> {
    return this.prisma.lessonScenario.update({ where: { lessonId }, data: { status: 'no_scenario' } });
  }

  private markFailed(lessonId: string): Promise<LessonScenario> {
    return this.prisma.lessonScenario.update({ where: { lessonId }, data: { status: 'failed' } });
  }

  private markReady(
    lessonId: string,
    generatorUserId: string,
    domain: VocabularyDomain,
    data: ScenarioSituationOutput,
    promptId: string,
    promptVersion: string,
  ): Promise<LessonScenario> {
    return this.prisma.lessonScenario.update({
      where: { lessonId },
      data: {
        status: 'ready',
        title: data.title,
        setting: data.setting,
        premise: data.premise,
        // The server's own choice is persisted, never the model's echo of it
        // — see the spec's decision on where the vocabulary domain comes from.
        vocabularyDomain: domain,
        roles: data.roles,
        discussionHooks: data.discussion_hooks,
        generatedBy: generatorUserId,
        promptId,
        promptVersion,
      },
    });
  }
}
