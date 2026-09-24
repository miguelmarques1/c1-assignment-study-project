import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Inject, Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import { ERROR_CODES } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { CredentialsService } from '../credentials/credentials.service';
import { MAX_SELECTED_AUDIO_MS } from '../excerpts/excerpt-selection.constants';
import { ExcerptSelectionReader, type StoredExcerptSelection } from '../excerpts/excerpt-selection.reader';
import {
  StageBlockedError,
  StageFailedError,
  type PipelineStageHandler,
  type StageRunContext,
} from '../pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../pipeline/pipeline-stage.registry';
import { INTERNAL_ERROR_REASON } from '../pipeline/pipeline.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { ClipAssessment } from '../speech/pronunciation-assessment.service';
import { PronunciationAssessmentService } from '../speech/pronunciation-assessment.service';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechNoRecognitionError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../speech/speech-errors';
import { StorageService } from '../storage/storage.service';
import { TRANSCRIPTION_REASONS } from '../transcription/transcription.constants';
import { ClipSliceError, ExcerptClipSlicer } from './excerpt-clip.slicer';
import { ExcerptAssessmentStore, storedWordsSchema, type ExcerptFailureCode } from './excerpt-assessment.store';
import { aggregatePronunciation, type AssessedExcerptInput } from './pronunciation-aggregate';
import { PronunciationResultWriter } from './pronunciation-result.writer';
import {
  PRONUNCIATION_EXCERPT_RETRY_DELAYS,
  PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE,
  PRONUNCIATION_REASONS,
  PRONUNCIATION_RETRY_POLICY,
  PRONUNCIATION_USAGE_FEATURE,
  PRONUNCIATION_WORK_ROOT,
} from './pronunciation.constants';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ClassifiedOutcome =
  | { kind: 'blocked'; error: StageBlockedError }
  | { kind: 'quota'; providerMessage: string | null }
  | { kind: 'region_unsupported'; providerMessage: string | null }
  | { kind: 'excerpt_failed'; failureCode: ExcerptFailureCode; providerMessage: string | null };

/** Thrown by `assessWithRetries` on its last attempt, carrying how many requests were actually sent. */
class AssessAttemptsExhausted {
  constructor(
    readonly cause: unknown,
    readonly attemptsUsed: number,
  ) {}
}

/**
 * The `pronunciation_assessment` stage: one participant's selected excerpts
 * (F09), each cut from their own `audio.ogg` and assessed against its own
 * reference text on their own Azure key. Per-excerpt outcomes are written as
 * they land, under the run's ownership, so a retry reprocesses only what is
 * not yet `assessed` and the pipeline view can count `N of M`. Completing it
 * leaves the branch waiting at `lesson_analysis` for F11.
 */
@Injectable()
export class PronunciationStageHandler implements PipelineStageHandler, OnModuleInit {
  readonly stage = 'pronunciation_assessment' as const;
  readonly provider = 'azure_speech' as const;
  readonly retryPolicy = PRONUNCIATION_RETRY_POLICY;

  private readonly workRoot: string;
  private readonly excerptRetryDelays: readonly number[];

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly prisma: PrismaService,
    private readonly excerpts: ExcerptSelectionReader,
    private readonly storage: StorageService,
    private readonly slicer: ExcerptClipSlicer,
    private readonly pronunciation: PronunciationAssessmentService,
    private readonly credentials: CredentialsService,
    private readonly store: ExcerptAssessmentStore,
    private readonly writer: PronunciationResultWriter,
    @Optional() @Inject(PRONUNCIATION_WORK_ROOT) workRoot?: string,
    @Optional() @Inject(PRONUNCIATION_EXCERPT_RETRY_DELAYS_OVERRIDE) excerptRetryDelays?: readonly number[],
  ) {
    this.workRoot = workRoot ?? tmpdir();
    this.excerptRetryDelays = excerptRetryDelays ?? PRONUNCIATION_EXCERPT_RETRY_DELAYS;
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(context: StageRunContext): Promise<void> {
    const { lessonId, userId } = context;

    const selection = await this.excerpts.forParticipant(lessonId, userId);
    if (!selection) {
      // F09 queues this stage in the transaction that writes the selection,
      // so this is a broken invariant, not a user state.
      throw new StageFailedError('internal_error', INTERNAL_ERROR_REASON);
    }

    if (selection.excerpts.length === 0) {
      await context.complete((tx) =>
        this.writer.replace(tx, {
          status: 'no_sample',
          lessonId,
          userId,
          selectionId: selection.selection.id,
          locale: env().TRANSCRIPTION_LOCALE,
        }),
      );
      return;
    }

    const excerptCount = selection.excerpts.length;
    const totalSelectedMs = selection.excerpts.reduce((sum, excerpt) => sum + (excerpt.endMs - excerpt.startMs), 0);
    if (totalSelectedMs > MAX_SELECTED_AUDIO_MS) {
      // Unreachable in practice: F09's rules schema already bounds this.
      throw new StageFailedError('internal_error', INTERNAL_ERROR_REASON);
    }

    const excerptIds = selection.excerpts.map((excerpt) => excerpt.id);
    await this.store.ensureRows(context, lessonId, userId, excerptIds);
    await this.store.resetUnassessed(context, excerptIds);
    await this.reportProgress(context, excerptCount);

    const participant = await this.prisma.lessonParticipant.findUnique({
      where: { lessonId_userId: { lessonId, userId } },
      select: { audioObjectKey: true },
    });
    if (!participant?.audioObjectKey) {
      throw new StageFailedError('pronunciation_storage_unreadable', PRONUNCIATION_REASONS.storageUnreadable);
    }

    const workDir = await mkdtemp(join(this.workRoot, 'f10-'));
    try {
      const audioPath = join(workDir, 'audio.ogg');
      await this.download(participant.audioObjectKey, audioPath);

      const pendingRows = await this.prisma.lessonExcerptAssessment.findMany({
        where: { lessonId, userId, status: 'pending' },
        select: { excerptId: true },
      });
      const pendingIds = new Set(pendingRows.map((row) => row.excerptId));
      const toProcess = selection.excerpts.filter((excerpt) => pendingIds.has(excerpt.id));

      let quotaExhausted = false;

      for (let i = 0; i < toProcess.length; i += 1) {
        const excerpt = toProcess[i]!;
        const clipPath = join(workDir, `${excerpt.id}.wav`);

        try {
          await this.slicer.slice(audioPath, excerpt.startMs, excerpt.endMs, clipPath);
        } catch (error) {
          const message =
            error instanceof ClipSliceError ? error.message : 'The sliced clip was empty or too small to assess.';
          await this.store.recordFailed(context, excerpt.id, 'dropped', 'slice_failed', message, 0);
          await this.reportProgress(context, excerptCount);
          continue;
        }

        try {
          const assessed = await this.assessWithRetries(userId, clipPath, excerpt.referenceText);
          await this.store.recordAssessed(context, excerpt.id, {
            clipStartMs: excerpt.startMs,
            clipEndMs: excerpt.endMs,
            scores: assessed.result.scores,
            words: assessed.result.words,
            recognizedText: assessed.result.recognizedText,
            latencyMs: assessed.result.latencyMs,
            attemptsUsed: assessed.attemptsUsed,
          });
        } catch (outcome) {
          const exhausted = outcome instanceof AssessAttemptsExhausted ? outcome : new AssessAttemptsExhausted(outcome, 1);
          const classified = await this.classify(userId, exhausted.cause);

          if (classified.kind === 'blocked') {
            // The in-flight excerpt stays `pending`; every already-assessed one is kept.
            await rm(clipPath, { force: true }).catch(() => undefined);
            throw classified.error;
          }
          if (classified.kind === 'region_unsupported') {
            await rm(clipPath, { force: true }).catch(() => undefined);
            throw new StageFailedError(
              'pronunciation_region_unsupported',
              PRONUNCIATION_REASONS.regionUnsupported,
              classified.providerMessage,
            );
          }
          if (classified.kind === 'quota') {
            quotaExhausted = true;
            await this.store.recordFailed(
              context,
              excerpt.id,
              'abandoned',
              'quota_exhausted',
              classified.providerMessage,
              exhausted.attemptsUsed,
            );
            for (let j = i + 1; j < toProcess.length; j += 1) {
              await this.store.recordFailed(context, toProcess[j]!.id, 'abandoned', 'quota_exhausted', null, 0);
            }
            await rm(clipPath, { force: true }).catch(() => undefined);
            await this.reportProgress(context, excerptCount);
            break;
          }

          await this.store.recordFailed(
            context,
            excerpt.id,
            'failed',
            classified.failureCode,
            classified.providerMessage,
            exhausted.attemptsUsed,
          );
          await rm(clipPath, { force: true }).catch(() => undefined);
          await this.reportProgress(context, excerptCount);
          continue;
        }

        await rm(clipPath, { force: true }).catch(() => undefined);
        await this.reportProgress(context, excerptCount);
      }

      await this.finish(context, selection, excerptCount, quotaExhausted);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async reportProgress(context: StageRunContext, total: number): Promise<void> {
    const counts = await this.store.counts(context.lessonId, context.userId);
    const done = (counts.assessed ?? 0) + (counts.failed ?? 0) + (counts.dropped ?? 0) + (counts.abandoned ?? 0);
    await context.reportProgress(done, total);
  }

  /**
   * Outside `withKey` on purpose: a storage fault is not the user's key
   * failing and must not be audited as one. A missing object and an
   * unreachable store both fail at once, without retry.
   */
  private async download(objectKey: string, filePath: string): Promise<void> {
    try {
      if ((await this.storage.statObject(objectKey)) === null) {
        throw new StageFailedError('pronunciation_storage_unreadable', PRONUNCIATION_REASONS.storageUnreadable);
      }
      await this.storage.downloadToFile(objectKey, filePath);
    } catch (error) {
      throw error instanceof StageFailedError
        ? error
        : new StageFailedError('pronunciation_storage_unreadable', PRONUNCIATION_REASONS.storageUnreadable);
    }
  }

  /**
   * Up to 2 more attempts, 2 s then 8 s apart, for a service error, a
   * rejected audio request or a recognition with nothing usable. Every other
   * outcome (a rejected key, quota, a bad region) is decided on the first
   * attempt — retrying it would burn quota against a cause retrying cannot fix.
   */
  private async assessWithRetries(
    userId: string,
    clipPath: string,
    referenceText: string,
  ): Promise<{ result: ClipAssessment; attemptsUsed: number }> {
    const maxAttempts = 1 + this.excerptRetryDelays.length;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.pronunciation.assessClip(userId, clipPath, referenceText, PRONUNCIATION_USAGE_FEATURE);
        return { result, attemptsUsed: attempt };
      } catch (error) {
        const retryable =
          error instanceof SpeechServiceError ||
          error instanceof SpeechAudioRejectedError ||
          error instanceof SpeechNoRecognitionError;
        const delay = this.excerptRetryDelays[attempt - 1];
        if (!retryable || delay === undefined) {
          throw new AssessAttemptsExhausted(error, attempt);
        }
        await sleep(delay);
      }
    }
    // Unreachable: the loop above always returns or throws before exiting normally.
    throw new AssessAttemptsExhausted(new Error('unreachable'), maxAttempts);
  }

  private async classify(userId: string, error: unknown): Promise<ClassifiedOutcome> {
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNAVAILABLE) {
      const azure = (await this.credentials.list(userId)).find((entry) => entry.provider === 'azure_speech');
      const code = azure?.status === 'missing' ? 'credential_missing' : 'credential_rejected';
      return { kind: 'blocked', error: new StageBlockedError(code, TRANSCRIPTION_REASONS[code]) };
    }
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNREADABLE) {
      return {
        kind: 'blocked',
        error: new StageBlockedError('credential_unreadable', TRANSCRIPTION_REASONS.credential_unreadable),
      };
    }
    if (error instanceof SpeechAuthRejectedError) {
      return {
        kind: 'blocked',
        error: new StageBlockedError('credential_rejected', TRANSCRIPTION_REASONS.credential_rejected, error.providerMessage),
      };
    }
    if (error instanceof SpeechThrottledError) {
      return { kind: 'quota', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechRegionUnsupportedError) {
      return { kind: 'region_unsupported', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechServiceError) {
      return { kind: 'excerpt_failed', failureCode: 'service_error', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechAudioRejectedError) {
      return { kind: 'excerpt_failed', failureCode: 'audio_rejected', providerMessage: error.providerMessage };
    }
    if (error instanceof SpeechNoRecognitionError) {
      return { kind: 'excerpt_failed', failureCode: 'no_speech_recognized', providerMessage: error.providerMessage };
    }
    // Unclassified: let it propagate to the runner's own retry policy.
    throw error;
  }

  private async finish(
    context: StageRunContext,
    selection: StoredExcerptSelection,
    excerptCount: number,
    quotaExhausted: boolean,
  ): Promise<void> {
    const counts = await this.store.counts(context.lessonId, context.userId);
    if ((counts.dropped ?? 0) === excerptCount) {
      throw new StageFailedError('pronunciation_audio_unprocessable', PRONUNCIATION_REASONS.audioUnprocessable);
    }

    const assessedRows = await this.prisma.lessonExcerptAssessment.findMany({
      where: { lessonId: context.lessonId, userId: context.userId, status: 'assessed' },
    });
    const byExcerptId = new Map(assessedRows.map((row) => [row.excerptId, row]));
    const assessedExcerpts: AssessedExcerptInput[] = selection.excerpts
      .filter((excerpt) => byExcerptId.has(excerpt.id))
      .map((excerpt) => {
        const row = byExcerptId.get(excerpt.id)!;
        return {
          excerptId: excerpt.id,
          utteranceId: excerpt.utteranceId,
          durationMs: (row.clipEndMs ?? excerpt.endMs) - (row.clipStartMs ?? excerpt.startMs),
          scores: {
            pronunciation: row.pronunciation!,
            accuracy: row.accuracy!,
            fluency: row.fluency!,
            prosody: row.prosody,
            completeness: row.completeness!,
          },
          words: storedWordsSchema.parse(row.words),
        };
      });

    const decision = aggregatePronunciation({
      excerptCount,
      assessedExcerpts,
      sparseSample: selection.selection.sparsePronunciationSample,
      quotaExhausted,
    });

    if (decision.outcome === 'fail') {
      throw new StageFailedError(
        quotaExhausted ? 'pronunciation_quota_exhausted' : 'pronunciation_too_few_assessed',
        decision.reason,
      );
    }

    await context.complete((tx) =>
      this.writer.replace(tx, {
        status: 'assessed',
        lessonId: context.lessonId,
        userId: context.userId,
        selectionId: selection.selection.id,
        locale: env().TRANSCRIPTION_LOCALE,
        excerptCount,
        sparseSample: selection.selection.sparsePronunciationSample,
        quotaExhausted,
        result: decision.result,
      }),
    );
  }
}
