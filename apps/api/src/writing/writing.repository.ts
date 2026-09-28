import { Injectable } from '@nestjs/common';
import type { Prisma, WritingCorrection, WritingCorrectionError, WritingTask } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type TxClient = Prisma.TransactionClient;

export interface NewWritingTaskRow {
  userId: string;
  activityId: string;
  heading: string;
  statement: string;
  statementWords: number;
  targetTags: string[];
  scenarioId: string;
  rulesVersion: string;
  rulesFingerprint: string;
  taxonomyVersion: string;
}

export interface DraftUpdate {
  text: string;
  revision: number;
  savedAt: Date;
  activeSeconds: number;
}

export interface NewCorrectionRow {
  taskId: string;
  userId: string;
  submissionId: string;
  draftRevision: number;
  submittedText: string;
  wordCount: number;
  requestedAt: Date;
  claimedAt: Date;
}

export interface CorrectionSuccessUpdate {
  attempts: number;
  attemptOutcomes: string[];
  promptId: string;
  promptVersion: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  overallComment: string;
  scoreGrammar: number;
  scoreVocabulary: number;
  scoreCoherence: number;
  scoreTaskAchievement: number;
  revisedText: string;
  discardedErrorCount: number;
  ledgerPriorCounts: Record<string, number>;
  rejectedTags: string[];
}

export type WritingFailureCode = 'request_failed' | 'invalid_output' | 'gemini_key';

export interface CorrectionFailureUpdate {
  attempts: number;
  attemptOutcomes: string[];
  failureCode: WritingFailureCode;
  failureDetail: string;
  rawResponse: string | null;
  promptId: string | null;
  promptVersion: string | null;
  model: string | null;
}

export interface NewErrorRow {
  idx: number;
  quote: string;
  tag: string;
  correction: string;
  explanation: string;
  startOffset: number;
  endOffset: number;
}

/**
 * The one writer and reader of writing rows (F17). Callers
 * (`WritingActivityService`, `WritingSubmissionService`,
 * `WritingCorrectionRunner`, `WritingViewBuilder`) stay free of Prisma's
 * shape and of the row-lock SQL. Every method takes a transaction client
 * when the caller has one open; a bare `PrismaService` read is fine outside
 * a transaction.
 */
@Injectable()
export class WritingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Locks the resolved activity row for the rest of the transaction, serialising concurrent first opens (A4). */
  async lockActivity(tx: TxClient, activityId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM study_plan_activities WHERE id = ${activityId}::uuid FOR UPDATE`;
  }

  /** The task for any id in the activity's carry-over lineage (A4), or null before the first open. */
  async findTaskByLineage(client: TxClient | PrismaService, activityIds: readonly string[]): Promise<WritingTask | null> {
    if (activityIds.length === 0) {
      return null;
    }
    return client.writingTask.findFirst({ where: { activityId: { in: [...activityIds] } } });
  }

  async taskById(client: TxClient | PrismaService, taskId: string): Promise<WritingTask | null> {
    return client.writingTask.findUnique({ where: { id: taskId } });
  }

  /** Locked for the rest of the transaction — the compare-and-set base for a draft save or a submission (A5, A9). */
  async taskForUpdate(tx: TxClient, taskId: string): Promise<WritingTask | null> {
    await tx.$queryRaw`SELECT id FROM writing_tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
    return tx.writingTask.findUnique({ where: { id: taskId } });
  }

  async insertTask(tx: TxClient, row: NewWritingTaskRow): Promise<WritingTask> {
    return tx.writingTask.create({
      data: {
        userId: row.userId,
        activityId: row.activityId,
        heading: row.heading,
        statement: row.statement,
        statementWords: row.statementWords,
        targetTags: row.targetTags,
        scenarioId: row.scenarioId,
        rulesVersion: row.rulesVersion,
        rulesFingerprint: row.rulesFingerprint,
        taxonomyVersion: row.taxonomyVersion,
      },
    });
  }

  /** The owner's most recent scenario ids across their own tasks — A3's no-repeat window — most recent first. */
  async recentScenarioIds(client: TxClient | PrismaService, userId: string, limit: number): Promise<string[]> {
    const rows = await client.writingTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { scenarioId: true },
    });
    return rows.map((row) => row.scenarioId);
  }

  /** An accepted save: text, revision, the server timestamp, accumulated time, and back to `draft` (A5, A12). */
  async updateDraft(tx: TxClient, taskId: string, update: DraftUpdate): Promise<void> {
    await tx.writingTask.update({
      where: { id: taskId },
      data: {
        draftText: update.text,
        draftRevision: update.revision,
        draftSavedAt: update.savedAt,
        activeSeconds: update.activeSeconds,
        status: 'draft',
      },
    });
  }

  /** A no-op save (identical text at a stale revision, A5) still counts the caller's active seconds. */
  async addActiveSeconds(tx: TxClient, taskId: string, delta: number): Promise<void> {
    if (delta === 0) {
      return;
    }
    await tx.writingTask.update({ where: { id: taskId }, data: { activeSeconds: { increment: delta } } });
  }

  async setSubmitted(tx: TxClient, taskId: string, submittedAt: Date): Promise<void> {
    await tx.writingTask.update({ where: { id: taskId }, data: { status: 'correcting', submittedAt } });
  }

  async setCorrected(tx: TxClient, taskId: string, correctedAt: Date): Promise<void> {
    await tx.writingTask.update({ where: { id: taskId }, data: { status: 'corrected', correctedAt } });
  }

  async setFailureStatus(tx: TxClient, taskId: string, status: 'uncorrected' | 'correction_failed'): Promise<void> {
    await tx.writingTask.update({ where: { id: taskId }, data: { status } });
  }

  // --- Corrections ---

  async correctionBySubmissionId(
    client: TxClient | PrismaService,
    taskId: string,
    submissionId: string,
  ): Promise<WritingCorrection | null> {
    return client.writingCorrection.findUnique({ where: { taskId_submissionId: { taskId, submissionId } } });
  }

  async correctionById(client: TxClient | PrismaService, correctionId: string): Promise<WritingCorrection | null> {
    return client.writingCorrection.findUnique({ where: { id: correctionId } });
  }

  /** Locked for the settling transaction — only the lock holder that still sees `running` may store a result (A10). */
  async correctionForUpdate(tx: TxClient, correctionId: string): Promise<WritingCorrection | null> {
    await tx.$queryRaw`SELECT id FROM writing_corrections WHERE id = ${correctionId}::uuid FOR UPDATE`;
    return tx.writingCorrection.findUnique({ where: { id: correctionId } });
  }

  async latestCorrectionForTask(client: TxClient | PrismaService, taskId: string): Promise<WritingCorrection | null> {
    return client.writingCorrection.findFirst({ where: { taskId }, orderBy: { requestedAt: 'desc' } });
  }

  async succeededCorrectionForTask(client: TxClient | PrismaService, taskId: string): Promise<WritingCorrection | null> {
    return client.writingCorrection.findFirst({ where: { taskId, status: 'succeeded' } });
  }

  async insertCorrection(tx: TxClient, row: NewCorrectionRow): Promise<WritingCorrection> {
    return tx.writingCorrection.create({
      data: {
        taskId: row.taskId,
        userId: row.userId,
        submissionId: row.submissionId,
        draftRevision: row.draftRevision,
        submittedText: row.submittedText,
        wordCount: row.wordCount,
        status: 'running',
        requestedAt: row.requestedAt,
        claimedAt: row.claimedAt,
      },
    });
  }

  async markSucceeded(tx: TxClient, correctionId: string, update: CorrectionSuccessUpdate): Promise<void> {
    await tx.writingCorrection.update({
      where: { id: correctionId },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        attempts: update.attempts,
        attemptOutcomes: update.attemptOutcomes,
        promptId: update.promptId,
        promptVersion: update.promptVersion,
        model: update.model,
        inputTokens: update.inputTokens,
        outputTokens: update.outputTokens,
        latencyMs: update.latencyMs,
        overallComment: update.overallComment,
        scoreGrammar: update.scoreGrammar,
        scoreVocabulary: update.scoreVocabulary,
        scoreCoherence: update.scoreCoherence,
        scoreTaskAchievement: update.scoreTaskAchievement,
        revisedText: update.revisedText,
        discardedErrorCount: update.discardedErrorCount,
        ledgerPriorCounts: update.ledgerPriorCounts as Prisma.InputJsonValue,
        rejectedTags: update.rejectedTags,
      },
    });
  }

  async markFailed(tx: TxClient, correctionId: string, update: CorrectionFailureUpdate): Promise<void> {
    await tx.writingCorrection.update({
      where: { id: correctionId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        attempts: update.attempts,
        attemptOutcomes: update.attemptOutcomes,
        failureCode: update.failureCode,
        failureDetail: update.failureDetail,
        rawResponse: update.rawResponse,
        promptId: update.promptId,
        promptVersion: update.promptVersion,
        model: update.model,
      },
    });
  }

  async insertErrors(tx: TxClient, correctionId: string, errors: readonly NewErrorRow[]): Promise<void> {
    if (errors.length === 0) {
      return;
    }
    await tx.writingCorrectionError.createMany({
      data: errors.map((error) => ({
        correctionId,
        idx: error.idx,
        quote: error.quote,
        tag: error.tag,
        correction: error.correction,
        explanation: error.explanation,
        startOffset: error.startOffset,
        endOffset: error.endOffset,
      })),
    });
  }

  async errorsForCorrection(client: TxClient | PrismaService, correctionId: string): Promise<WritingCorrectionError[]> {
    return client.writingCorrectionError.findMany({ where: { correctionId }, orderBy: { idx: 'asc' } });
  }

  // --- Limit and recovery ---

  /** Every counted request (accepted submission or resubmission) in the rolling window (A14). */
  async requestedAtsSince(client: TxClient | PrismaService, userId: string, since: Date): Promise<Date[]> {
    const rows = await client.writingCorrection.findMany({
      where: { userId, requestedAt: { gte: since } },
      select: { requestedAt: true },
    });
    return rows.map((row) => row.requestedAt);
  }

  /** Reclaims every `running` correction whose lease has expired, up to `batch` (A10). */
  async claimExpiredCorrections(tx: TxClient, now: Date, leaseMs: number, batch: number): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE writing_corrections
      SET claimed_at = ${now}
      WHERE id IN (
        SELECT id FROM writing_corrections
        WHERE status = 'running' AND claimed_at < ${new Date(now.getTime() - leaseMs)}
        ORDER BY claimed_at ASC
        LIMIT ${batch}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `;
    return rows.map((row) => row.id);
  }
}
