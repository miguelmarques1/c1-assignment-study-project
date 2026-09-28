import { Injectable } from '@nestjs/common';
import { Prisma, type SpeakingTask } from '@prisma/client';
import type { SpeakingShape } from '@english-quest/shared';

import { PrismaService } from '../prisma/prisma.service';

export type TxClient = Prisma.TransactionClient;

export interface NewSpeakingTaskRow {
  userId: string;
  rootActivityId: string;
  shape: SpeakingShape;
  corpusEntryId: string;
  corpusVersion: string;
  corpusFingerprint: string;
  referenceText: string | null;
  promptText: string | null;
  hint: string | null;
  targetTags: string[];
  focusTags: string[];
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Persistence for `speaking_tasks`. One row per carry-over lineage
 * (`root_activity_id` is unique), materialized idempotently on first read
 * (A19) and never changed afterward.
 */
@Injectable()
export class SpeakingTaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByRoot(client: TxClient | PrismaService, rootActivityId: string): Promise<SpeakingTask | null> {
    return client.speakingTask.findUnique({ where: { rootActivityId } });
  }

  byId(client: TxClient | PrismaService, taskId: string): Promise<SpeakingTask | null> {
    return client.speakingTask.findUnique({ where: { id: taskId } });
  }

  /** `SELECT ... FOR UPDATE` on the task row — serializes concurrent uploads and re-scores for the same task. */
  async lockForUpdate(tx: TxClient, taskId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM speaking_tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
  }

  /**
   * Inserts the task unless one already exists for this lineage root
   * (idempotent under a concurrent read, per A19's `ON CONFLICT DO NOTHING`
   * then read back). Prisma has no bare "insert or ignore", so a unique
   * violation on the create is read back instead of retried.
   */
  async insertIfAbsent(client: TxClient | PrismaService, row: NewSpeakingTaskRow): Promise<SpeakingTask> {
    try {
      return await client.speakingTask.create({
        data: {
          userId: row.userId,
          rootActivityId: row.rootActivityId,
          shape: row.shape,
          corpusEntryId: row.corpusEntryId,
          corpusVersion: row.corpusVersion,
          corpusFingerprint: row.corpusFingerprint,
          referenceText: row.referenceText,
          promptText: row.promptText,
          hint: row.hint,
          targetTags: row.targetTags,
          focusTags: row.focusTags,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findByRoot(client, row.rootActivityId);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /** Every corpus entry's most recent use by this owner, for A4's recency ranking. */
  async usageFor(userId: string): Promise<ReadonlyMap<string, Date>> {
    const rows = await this.prisma.speakingTask.groupBy({
      by: ['corpusEntryId'],
      where: { userId },
      _max: { createdAt: true },
    });
    return new Map(rows.filter((row) => row._max.createdAt !== null).map((row) => [row.corpusEntryId, row._max.createdAt!]));
  }
}
