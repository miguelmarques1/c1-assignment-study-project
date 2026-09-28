import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { ERROR_CODES, type SpeakingAttemptView, type SpeakingShape } from '@english-quest/shared';
import type { SpeakingAttempt, SpeakingTask } from '@prisma/client';

import { AppError } from '../common/app-error';
import { CredentialsService } from '../credentials/credentials.service';
import { PlanActivityStateService } from '../plans/plan-activity-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileIngestionService } from '../profile/profile-ingestion.service';
import { StorageService } from '../storage/storage.service';
import { bestAttempt, canRescore, canUpload } from './scoring/attempt-policy';
import { buildSpeakingOutcome } from './scoring/speaking-outcome';
import { SpeakingScorerService, type ScoreOutcome } from './scoring/speaking-scorer.service';
import { readAudioBody } from './audio/audio-body';
import { parseWavHeader } from './audio/wav-header';
import { SpeakingAttemptRepository, toAttemptSummary } from './speaking-attempt.repository';
import { SpeakingTaskRepository } from './speaking-task.repository';
import { SpeakingViewMapper } from './speaking-view.mapper';
import {
  SPEAKING_ACTIVITY_KINDS,
  SPEAKING_FAILURE_MESSAGES,
  SPEAKING_MAX_DURATION_MS,
  SPEAKING_MAX_UPLOAD_BYTES,
  SPEAKING_MIN_DURATION_MS,
  SPEAKING_WORK_ROOT,
  attemptAudioKey,
} from './speaking.constants';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SettleOutcome {
  row: SpeakingAttempt;
  isBest: boolean;
  deleteObjectAfterCommit: boolean;
}

/**
 * Upload and re-score: the attempt lifecycle from spec §5. Every mutating
 * step runs under the task row's lock, so the limit, the one-in-flight rule
 * and a stale lease's conversion hold across devices and a double tap alike.
 */
@Injectable()
export class SpeakingAttemptService {
  private readonly logger = new Logger(SpeakingAttemptService.name);
  private readonly workRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planActivityState: PlanActivityStateService,
    private readonly taskRepository: SpeakingTaskRepository,
    private readonly attemptRepository: SpeakingAttemptRepository,
    private readonly credentials: CredentialsService,
    private readonly storage: StorageService,
    private readonly scorer: SpeakingScorerService,
    private readonly profileIngestion: ProfileIngestionService,
    private readonly mapper: SpeakingViewMapper,
    @Optional() @Inject(SPEAKING_WORK_ROOT) workRoot?: string,
  ) {
    this.workRoot = workRoot ?? tmpdir();
  }

  async upload(
    userId: string,
    activityId: string,
    clientAttemptId: string,
    req: IncomingMessage,
    now: Date,
  ): Promise<{ view: SpeakingAttemptView; status: 200 | 201 }> {
    const resolved = await this.planActivityState.resolveForOwner(userId, activityId);
    if (!SPEAKING_ACTIVITY_KINDS.has(resolved.kind)) {
      throw AppError.speakingActivityNotFound();
    }

    const existing = await this.attemptRepository.byClientId(this.prisma, userId, clientAttemptId);
    if (existing) {
      const task = await this.taskRepository.byId(this.prisma, existing.taskId);
      return { view: await this.toView(existing, task!, now), status: 200 };
    }

    if (resolved.planStatus === 'archived') {
      throw AppError.planActivityNotInCurrentPlan(activityId);
    }
    if (resolved.state === 'skipped') {
      throw AppError.speakingActivitySkipped();
    }
    await this.assertAzureUsable(userId);

    const body = await readAudioBody(req, SPEAKING_MAX_UPLOAD_BYTES);
    const parsed = parseWavHeader(body);
    if (!parsed.ok) {
      throw AppError.speakingAudioInvalid(parsed.reason);
    }
    if (parsed.info.durationMs > SPEAKING_MAX_DURATION_MS) {
      throw AppError.speakingAudioTooLong();
    }

    const rootActivityId = resolved.lineage[0]!;
    const task = await this.taskRepository.findByRoot(this.prisma, rootActivityId);
    if (!task) {
      // The runner always reads the activity (materializing the task) before it can record.
      throw AppError.speakingActivityNotFound();
    }

    const attemptId = randomUUID();

    if (parsed.info.durationMs < SPEAKING_MIN_DURATION_MS) {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.taskRepository.lockForUpdate(tx, task.id);
        await this.planActivityState.markStarted(userId, activityId, { at: now }, tx);
        return this.attemptRepository.insertDiscarded(tx, {
          id: attemptId,
          taskId: task.id,
          userId,
          activityId: resolved.activityId,
          clientAttemptId,
          audioBytes: body.length,
          durationMs: parsed.info.durationMs,
          failureReason: SPEAKING_FAILURE_MESSAGES.not_enough_speech,
        });
      });
      return { view: this.mapper.toAttemptView(row, false, task.referenceText, now), status: 201 };
    }

    const objectKey = attemptAudioKey(resolved.activityId, userId, attemptId);

    await this.prisma.$transaction(async (tx) => {
      await this.taskRepository.lockForUpdate(tx, task.id);
      await this.attemptRepository.markInterrupted(tx, task.id, now, SPEAKING_FAILURE_MESSAGES.interrupted);
      const attempts = await this.attemptRepository.forTask(tx, task.id);
      const decision = canUpload(attempts.map(toAttemptSummary), now);
      if (!decision.allowed) {
        throw decision.reason === 'attempt_limit' ? AppError.speakingAttemptLimit() : AppError.speakingScoringInFlight();
      }
      await this.planActivityState.markStarted(userId, activityId, { at: now }, tx);
      await this.attemptRepository.insertScoring(tx, {
        id: attemptId,
        taskId: task.id,
        userId,
        activityId: resolved.activityId,
        clientAttemptId,
        audioObjectKey: objectKey,
        audioBytes: body.length,
        durationMs: parsed.info.durationMs,
        scoringStartedAt: now,
      });
    });

    try {
      await this.storage.putObject(objectKey, body, 'audio/wav');
    } catch (error) {
      await this.attemptRepository.delete(this.prisma, attemptId);
      this.logger.warn(`could not store audio for attempt ${attemptId}: ${errorMessage(error)}`);
      throw AppError.speakingUploadFailed();
    }

    const result = await this.runScorer(userId, task, body, parsed.info.durationMs);
    this.logOutcome('upload', attemptId, task.shape, result);

    const settled = await this.settleResult(task, attemptId, objectKey, resolved.activityId, userId, result, now);
    await this.cleanupIfDiscarded(objectKey, settled);

    return {
      view: this.mapper.toAttemptView(settled.row, settled.isBest, settled.row.transcriptText ?? task.referenceText, now),
      status: 201,
    };
  }

  async rescore(userId: string, attemptId: string, now: Date): Promise<SpeakingAttemptView> {
    const existing = await this.attemptRepository.byIdForOwner(this.prisma, userId, attemptId);
    if (!existing) {
      throw AppError.speakingAttemptNotFound();
    }
    const task = await this.taskRepository.byId(this.prisma, existing.taskId);
    if (!task) {
      throw AppError.speakingAttemptNotFound();
    }

    const resolved = await this.planActivityState.resolveForOwner(userId, existing.activityId);
    if (resolved.planStatus === 'archived') {
      throw AppError.planActivityNotInCurrentPlan(existing.activityId);
    }
    await this.assertAzureUsable(userId);

    await this.prisma.$transaction(async (tx) => {
      await this.taskRepository.lockForUpdate(tx, task.id);
      await this.attemptRepository.markInterrupted(tx, task.id, now, SPEAKING_FAILURE_MESSAGES.interrupted);
      const fresh = await this.attemptRepository.byIdForOwner(tx, userId, attemptId);
      const attempts = await this.attemptRepository.forTask(tx, task.id);
      const decision = canRescore(toAttemptSummary(fresh!), attempts.map(toAttemptSummary), now);
      if (!decision.allowed) {
        if (decision.reason === 'attempt_limit') {
          throw AppError.speakingAttemptLimit();
        }
        if (decision.reason === 'scoring_in_flight') {
          throw AppError.speakingScoringInFlight();
        }
        throw AppError.speakingNotRescorable(decision.reason);
      }
      await this.attemptRepository.markScoringAgain(tx, attemptId, now);
    });

    if (!existing.audioObjectKey || !(await this.objectExists(existing.audioObjectKey))) {
      const row = await this.prisma.$transaction((tx) =>
        this.attemptRepository.settle(tx, attemptId, {
          state: 'failed',
          failureCode: 'audio_missing',
          failureReason: SPEAKING_FAILURE_MESSAGES.audio_missing,
        }),
      );
      return this.mapper.toAttemptView(row, false, task.referenceText, now);
    }

    const workDir = await mkdtemp(join(this.workRoot, 'f18-rescore-'));
    let result: ScoreOutcome;
    try {
      const wavPath = join(workDir, 'audio.wav');
      await this.storage.downloadToFile(existing.audioObjectKey, wavPath);
      result = await this.scorer.score({
        userId,
        shape: task.shape as SpeakingShape,
        referenceText: task.referenceText,
        wavPath,
        durationMs: existing.durationMs,
      });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }

    this.logOutcome('rescore', attemptId, task.shape, result);

    const settled = await this.settleResult(task, attemptId, existing.audioObjectKey, resolved.activityId, userId, result, now);
    await this.cleanupIfDiscarded(existing.audioObjectKey, settled);

    return this.mapper.toAttemptView(settled.row, settled.isBest, settled.row.transcriptText ?? task.referenceText, now);
  }

  async audioFor(userId: string, attemptId: string): Promise<Buffer> {
    const attempt = await this.attemptRepository.byIdForOwner(this.prisma, userId, attemptId);
    if (!attempt || !attempt.audioObjectKey) {
      throw AppError.speakingAttemptNotFound();
    }
    return this.storage.getObject(attempt.audioObjectKey);
  }

  private async assertAzureUsable(userId: string): Promise<void> {
    const azure = (await this.credentials.list(userId)).find((entry) => entry.provider === 'azure_speech');
    if (!azure || azure.status === 'missing' || azure.status === 'invalid') {
      throw new AppError(ERROR_CODES.CREDENTIAL_UNAVAILABLE, { provider: 'azure_speech' });
    }
  }

  private async objectExists(objectKey: string): Promise<boolean> {
    try {
      return await this.storage.objectExists(objectKey);
    } catch {
      return false;
    }
  }

  /** Writes the buffer to a scratch work directory and runs the scorer against it, always cleaning up. */
  private async runScorer(userId: string, task: SpeakingTask, body: Buffer, durationMs: number): Promise<ScoreOutcome> {
    const workDir = await mkdtemp(join(this.workRoot, 'f18-upload-'));
    try {
      const wavPath = join(workDir, 'audio.wav');
      await writeFile(wavPath, body);
      return await this.scorer.score({ userId, shape: task.shape as SpeakingShape, referenceText: task.referenceText, wavPath, durationMs });
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async toView(attempt: SpeakingAttempt, task: SpeakingTask, now: Date): Promise<SpeakingAttemptView> {
    const attempts = await this.attemptRepository.forTask(this.prisma, task.id);
    const best = bestAttempt(attempts.map(toAttemptSummary));
    return this.mapper.toAttemptView(attempt, attempt.id === best?.id, attempt.transcriptText ?? task.referenceText, now);
  }

  private async settleResult(
    task: SpeakingTask,
    attemptId: string,
    objectKey: string | null,
    activityId: string,
    userId: string,
    result: ScoreOutcome,
    now: Date,
  ): Promise<SettleOutcome> {
    let isBest = false;
    let deleteObjectAfterCommit = false;

    const row = await this.prisma.$transaction(async (tx) => {
      await this.taskRepository.lockForUpdate(tx, task.id);

      if (result.kind === 'discarded') {
        deleteObjectAfterCommit = objectKey !== null;
        return this.attemptRepository.settle(tx, attemptId, {
          state: 'discarded',
          failureCode: result.code,
          failureReason: SPEAKING_FAILURE_MESSAGES[result.code],
        });
      }
      if (result.kind === 'failed') {
        return this.attemptRepository.settle(tx, attemptId, {
          state: 'failed',
          failureCode: result.code,
          failureReason: SPEAKING_FAILURE_MESSAGES[result.code],
        });
      }

      const before = await this.attemptRepository.forTask(tx, task.id);
      const scoredCountBefore = before.filter((attempt) => attempt.state === 'scored').length;

      const settled = await this.attemptRepository.settle(tx, attemptId, {
        state: 'scored',
        ordinal: scoredCountBefore + 1,
        scoredAt: now,
        scores: result.scores,
        recognizedWordCount: result.recognizedWordCount,
        transcriptText: result.transcript,
        words: result.words,
        failingPhonemes: result.failingPhonemes,
        segments: result.segments,
        locale: result.locale,
        latencyMs: result.latencyMs,
      });

      const after = await this.attemptRepository.forTask(tx, task.id);
      const best = bestAttempt(after.map(toAttemptSummary));
      isBest = best?.id === attemptId;

      if (isBest) {
        const outcome = buildSpeakingOutcome({
          userId,
          rootActivityId: task.rootActivityId,
          kind: task.shape === 'read_aloud' ? 'pronunciation' : 'speaking',
          targetTags: task.targetTags,
          bestAttempt: { id: attemptId, scoredAt: now, scores: result.scores, words: result.words, failingPhonemes: result.failingPhonemes },
        });
        await this.profileIngestion.ingestActivityOutcome(outcome, tx);
      }

      if (scoredCountBefore === 0) {
        const totalDurationMs = after.reduce((sum, attempt) => sum + attempt.durationMs, 0);
        await this.planActivityState.markCompleted(
          userId,
          activityId,
          { completionKey: attemptId, completedAt: now, timeSpentSeconds: Math.ceil(totalDurationMs / 1000) },
          tx,
        );
      }

      return settled;
    });

    return { row, isBest, deleteObjectAfterCommit };
  }

  private async cleanupIfDiscarded(objectKey: string, settled: SettleOutcome): Promise<void> {
    if (!settled.deleteObjectAfterCommit) {
      return;
    }
    await this.storage.deleteObject(objectKey).catch((error) => this.logger.warn(`could not delete discarded audio ${objectKey}: ${errorMessage(error)}`));
  }

  /** Never logs a transcript or a score — only what the outcome was and how it got there. */
  private logOutcome(action: 'upload' | 'rescore', attemptId: string, shape: string, result: ScoreOutcome): void {
    if (result.kind === 'scored') {
      this.logger.log(`${action} ${attemptId} shape=${shape} outcome=scored segments=${result.segments.length} latencyMs=${result.latencyMs}`);
    } else if (result.kind === 'discarded') {
      this.logger.log(`${action} ${attemptId} shape=${shape} outcome=discarded code=${result.code}`);
    } else {
      this.logger.warn(`${action} ${attemptId} shape=${shape} outcome=failed code=${result.code}`);
    }
  }
}
