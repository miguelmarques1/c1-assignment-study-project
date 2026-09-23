import { Injectable, Logger } from '@nestjs/common';
import type { Lesson, LessonScenario } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { DomainRotationService } from './domain-rotation.service';
import { RoleCardService } from './role-card.service';
import { SituationService } from './situation.service';

/**
 * The generation fan-out's single entry point. Owns the order in which the
 * situation and the cards are produced, and the fire-and-forget boundary:
 * every method here returns as soon as the row state the caller needs is
 * settled, while the model calls that follow run in the background and are
 * never allowed to become an unhandled rejection or to propagate into the
 * request that triggered them.
 */
@Injectable()
export class ScenarioOrchestratorService {
  private readonly logger = new Logger(ScenarioOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: DomainRotationService,
    private readonly situations: SituationService,
    private readonly roleCards: RoleCardService,
  ) {}

  /**
   * Called when a participant registers for the lesson (token issuance).
   * The very first call for a given lesson is, by construction, the opener —
   * nothing else creates a `lesson_participants` row before this fires.
   */
  async onParticipantRegistered(lesson: Lesson, userId: string): Promise<void> {
    const { scenario, created } = await this.situations.ensureScenarioRow(lesson.id, userId);

    if (created) {
      this.runInBackground(this.regenerateSituationAndCards(lesson), 'initial generation', lesson.id);
      return;
    }

    if (scenario.status === 'ready') {
      this.runInBackground(
        this.roleCards.ensureCard(lesson.id, userId, scenario),
        'role card generation',
        lesson.id,
      );
    }
    // pending or failed or no_scenario: nothing to do for this participant
    // yet. A situation that later becomes ready (from this same generation,
    // or a future retry) re-scans every registered participant and picks
    // them up then.
  }

  /**
   * Regenerates the situation and every registered participant's card, each
   * with its own owner's key. Row state resets synchronously so the response
   * reflects `pending` immediately; the caller has already checked who may
   * call this, how many times, and that the lesson has not started.
   */
  async reroll(lesson: Lesson): Promise<LessonScenario> {
    const scenario = await this.situations.beginReroll(lesson.id);
    await this.roleCards.resetAllForLesson(lesson.id);

    this.runInBackground(this.regenerateSituationAndCards(lesson), 'reroll', lesson.id);

    return scenario;
  }

  /**
   * Retries a failed situation. Does not touch role cards directly — a fresh
   * `ready` situation re-scans registered participants the same way initial
   * generation does. The caller has already checked the situation is `failed`.
   */
  async retry(lesson: Lesson): Promise<LessonScenario> {
    const scenario = await this.situations.beginRetry(lesson.id);

    this.runInBackground(this.regenerateSituationAndCards(lesson), 'retry', lesson.id);

    return scenario;
  }

  private async regenerateSituationAndCards(lesson: Lesson): Promise<void> {
    const participantIds = await this.registeredParticipantIds(lesson.id);
    // Domain exclusion is computed over whoever is registered right now —
    // usually just the opener for the first generation, but the correct
    // generalization for a reroll or retry with more than one participant
    // already present. See the spec's Assumptions.
    const domain = await this.domains.chooseDomain(participantIds);
    const scenario = await this.situations.generate(lesson, lesson.openedBy, domain);

    if (scenario.status !== 'ready') {
      return;
    }

    // Re-read, not reuse: anyone who registered while the situation was
    // generating saw it `pending` and left their card to this fan-out.
    // Registration is written before that status read, so every such
    // participant is already in this list.
    const cardOwners = await this.registeredParticipantIds(lesson.id);
    await Promise.all(
      cardOwners.map((userId) =>
        this.roleCards
          .ensureCard(lesson.id, userId, scenario)
          .catch((error: unknown) =>
            this.logger.error(`Role card generation failed for lesson ${lesson.id} user ${userId}`, error),
          ),
      ),
    );
  }

  private async registeredParticipantIds(lessonId: string): Promise<string[]> {
    const rows = await this.prisma.lessonParticipant.findMany({
      where: { lessonId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /**
   * Fires a promise without awaiting it, logging instead of throwing on
   * failure — the boundary that keeps a model call from ever surfacing as an
   * unhandled rejection or from blocking the request that triggered it.
   */
  private runInBackground(work: Promise<unknown>, label: string, lessonId: string): void {
    work.catch((error: unknown) => {
      this.logger.error(`Scenario ${label} failed for lesson ${lessonId}`, error);
    });
  }
}
