import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ERROR_CODES } from '@english-quest/shared';

import { AppError } from '../common/app-error';
import { CredentialsService } from '../credentials/credentials.service';
import {
  StageBlockedError,
  StageFailedError,
  StageRetryableError,
  type PipelineStageHandler,
  type StageRunContext,
} from '../pipeline/pipeline-stage.handler';
import { PipelineStageRegistry } from '../pipeline/pipeline-stage.registry';
import { PrismaService } from '../prisma/prisma.service';
import {
  SpeechAudioRejectedError,
  SpeechAuthRejectedError,
  SpeechRegionUnsupportedError,
  SpeechServiceError,
  SpeechThrottledError,
} from '../speech/speech-errors';
import { SpeechToTextService, type SpeechTranscription } from '../speech/speech-to-text.service';
import { StorageService } from '../storage/storage.service';
import { TranscriptWriter } from './transcript-writer.service';
import {
  TRANSCRIPTION_REASONS,
  TRANSCRIPTION_RETRY_POLICY,
  TRANSCRIPTION_USAGE_FEATURE,
} from './transcription.constants';

function failed(code: keyof typeof TRANSCRIPTION_REASONS & `transcription_${string}`, providerMessage: string | null = null) {
  return new StageFailedError(code, TRANSCRIPTION_REASONS[code], providerMessage);
}

/**
 * The `transcription` stage: one participant's verified `audio.ogg`, sent
 * to Azure fast transcription on that participant's own key, stored as
 * ordered utterances. It only does the work and says how it went; the
 * pipeline runner owns the stage's state, retries and hand-off.
 */
@Injectable()
export class TranscriptionStageHandler implements PipelineStageHandler, OnModuleInit {
  readonly stage = 'transcription' as const;
  readonly provider = 'azure_speech' as const;
  readonly retryPolicy = TRANSCRIPTION_RETRY_POLICY;

  constructor(
    private readonly registry: PipelineStageRegistry,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly speech: SpeechToTextService,
    private readonly credentials: CredentialsService,
    private readonly writer: TranscriptWriter,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async run(context: StageRunContext): Promise<void> {
    const participant = await this.prisma.lessonParticipant.findUnique({
      where: { lessonId_userId: { lessonId: context.lessonId, userId: context.userId } },
      select: { audioObjectKey: true },
    });
    if (!participant?.audioObjectKey) {
      throw failed('transcription_storage_unreadable');
    }

    const workDir = await mkdtemp(join(tmpdir(), 'f08-'));
    try {
      const filePath = join(workDir, 'audio.ogg');
      await this.download(participant.audioObjectKey, filePath);

      const transcription = await this.transcribe(context.userId, filePath);
      if (transcription.utterances.length === 0) {
        throw failed('transcription_no_speech');
      }

      await context.complete((tx) =>
        this.writer.replace(tx, { lessonId: context.lessonId, userId: context.userId, transcription }),
      );
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Outside `withKey` on purpose: a storage fault is not the user's key
   * failing and must not be audited as one. A missing object and an
   * unreachable store both fail at once, without retry (PRD).
   */
  private async download(objectKey: string, filePath: string): Promise<void> {
    try {
      if ((await this.storage.statObject(objectKey)) === null) {
        throw failed('transcription_storage_unreadable');
      }
      await this.storage.downloadToFile(objectKey, filePath);
    } catch (error) {
      throw error instanceof StageFailedError ? error : failed('transcription_storage_unreadable');
    }
  }

  private async transcribe(userId: string, filePath: string): Promise<SpeechTranscription> {
    try {
      return await this.speech.transcribeFile(userId, filePath, TRANSCRIPTION_USAGE_FEATURE);
    } catch (error) {
      throw await this.classify(userId, error);
    }
  }

  private async classify(userId: string, error: unknown): Promise<unknown> {
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNAVAILABLE) {
      // The vault says the same thing for "no key" and "a key already
      // marked invalid"; the user needs a different sentence for each.
      const azure = (await this.credentials.list(userId)).find((entry) => entry.provider === 'azure_speech');
      const code = azure?.status === 'missing' ? 'credential_missing' : 'credential_rejected';
      return new StageBlockedError(code, TRANSCRIPTION_REASONS[code]);
    }
    if (error instanceof AppError && error.code === ERROR_CODES.CREDENTIAL_UNREADABLE) {
      return new StageBlockedError('credential_unreadable', TRANSCRIPTION_REASONS.credential_unreadable);
    }
    if (error instanceof SpeechAuthRejectedError) {
      return new StageBlockedError(
        'credential_rejected',
        TRANSCRIPTION_REASONS.credential_rejected,
        error.providerMessage,
      );
    }
    if (error instanceof SpeechThrottledError) {
      return new StageRetryableError(
        'transcription_quota_exceeded',
        TRANSCRIPTION_REASONS.transcription_quota_exceeded,
        error.providerMessage,
      );
    }
    if (error instanceof SpeechServiceError) {
      return new StageRetryableError(
        'transcription_service_error',
        TRANSCRIPTION_REASONS.transcription_service_error,
        error.providerMessage,
      );
    }
    if (error instanceof SpeechAudioRejectedError) {
      return failed('transcription_audio_rejected', error.providerMessage);
    }
    if (error instanceof SpeechRegionUnsupportedError) {
      return failed('transcription_region_unsupported', error.providerMessage);
    }
    // Unclassified: the runner retries it as `internal_error` and logs it.
    return error;
  }
}
