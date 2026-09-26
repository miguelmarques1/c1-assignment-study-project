import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { ProfileIngestionService } from '../profile/profile-ingestion.service';
import {
  PROFILE_RECONCILIATION_BATCH,
  PROFILE_RECONCILIATION_INTERVAL_MS,
  PROFILE_TRANSACTION_TIMEOUT_MS,
} from '../profile/profile.constants';
import { PronunciationResultReader } from '../pronunciation/pronunciation-result.reader';
import { pronunciationSource } from './lesson-profile-sources';

export interface ReconciliationResult {
  checked: number;
  applied: number;
}

interface PendingResult {
  lesson_id: string;
  user_id: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ingests every pronunciation result the owner's profile has not applied at
 * its current revision. The pipeline is linear, so a branch whose analysis
 * is blocked on a missing Gemini key (or failed) never reaches
 * `profile_update`; this sweep is how the pronunciation dimension still
 * moves in that case, with the other five competencies left untouched. The
 * same sweep recovers a crash between F10's completion and the stage, and
 * backfills lessons F10 processed before F12 existed. The stage applies
 * both sources itself, so the normal path never waits on this.
 *
 * Oldest lesson first, at most 50 per tick, each in its own transaction:
 * one failure never stops the sweep (`LessonLifecycleJob`'s idiom), and a
 * result the stage applies in the meantime is simply skipped.
 */
@Injectable()
export class ProfileReconciliationJob {
  private readonly logger = new Logger(ProfileReconciliationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pronunciation: PronunciationResultReader,
    private readonly ingestion: ProfileIngestionService,
  ) {}

  @Interval('profile-reconciliation', PROFILE_RECONCILIATION_INTERVAL_MS)
  async run(): Promise<ReconciliationResult> {
    const pending = await this.prisma.$queryRaw<PendingResult[]>`
      SELECT r.lesson_id, r.user_id
      FROM lesson_pronunciation_results r
      JOIN lessons l ON l.id = r.lesson_id
      WHERE NOT EXISTS (
        SELECT 1 FROM profile_sources s
        WHERE s.user_id = r.user_id
          AND s.kind = 'lesson_pronunciation'
          AND s.source_key = r.lesson_id
          AND s.revision = r.id::text
      )
      ORDER BY COALESCE(l.started_at, l.opened_at) ASC, r.created_at ASC
      LIMIT ${PROFILE_RECONCILIATION_BATCH}`;

    let applied = 0;
    for (const row of pending) {
      try {
        if (await this.applyOne(row.lesson_id, row.user_id)) {
          applied += 1;
        }
      } catch (error) {
        this.logger.warn(
          `Profile reconciliation could not apply lesson ${row.lesson_id} for user ${row.user_id}: ${errorMessage(error)}`,
        );
      }
    }
    if (applied > 0) {
      this.logger.log(`Profile reconciliation applied ${applied} pronunciation result(s).`);
    }
    return { checked: pending.length, applied };
  }

  private async applyOne(lessonId: string, userId: string): Promise<boolean> {
    const [lesson, view] = await Promise.all([
      this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true, startedAt: true, openedAt: true } }),
      this.pronunciation.forParticipant(lessonId, userId),
    ]);
    if (!lesson || !view?.result) {
      return false;
    }
    const source = pronunciationSource(userId, lesson, view.result);
    const result = await this.prisma.$transaction((tx) => this.ingestion.applySource(tx, source), {
      timeout: PROFILE_TRANSACTION_TIMEOUT_MS,
    });
    return result.outcome !== 'skipped';
  }
}
