import type { Readable } from 'node:stream';

import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '../common/app-error';
import { ContentBankService } from '../content/content-bank.service';
import { PlanActivityStateService } from '../plans/plan-activity-state.service';
import { StorageService, StorageUnavailableError } from '../storage/storage.service';
import { MEDIA_CACHE_CONTROL } from './activity.constants';

export interface ActivityAudio {
  stream: Readable;
  status: 200 | 206;
  headers: Record<string, string>;
}

/**
 * Streams a listening activity's audio through the API (A19). The store's
 * endpoint is a container hostname no client can reach, and a presigned URL
 * would bypass the ownership check, so the bytes pass through here with
 * byte-range support — which is what makes seeking work in `<audio>` and
 * ExoPlayer.
 */
@Injectable()
export class ActivityMediaService {
  private readonly logger = new Logger(ActivityMediaService.name);

  constructor(
    private readonly state: PlanActivityStateService,
    private readonly content: ContentBankService,
    private readonly storage: StorageService,
  ) {}

  async open(userId: string, activityId: string, rangeHeader: string | undefined): Promise<ActivityAudio> {
    const resolved = await this.state.resolveForOwner(userId, activityId);
    if (resolved.kind !== 'listening' || !resolved.contentItemId) {
      throw AppError.activityAudioNotFound();
    }
    const item = await this.content.getPayload(resolved.contentItemId);
    if (!item.mediaObjectKey) {
      throw AppError.activityAudioNotFound();
    }

    let audio;
    try {
      audio = await this.storage.getObjectStream(item.mediaObjectKey, rangeHeader);
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        throw AppError.activityAudioUnavailable();
      }
      throw error;
    }
    if (!audio) {
      this.logger.warn(`item ${item.id} (${item.slug}) has no object at ${item.mediaObjectKey}`);
      throw AppError.activityAudioNotFound();
    }

    const headers: Record<string, string> = {
      'Content-Type': item.mediaContentType ?? audio.contentType ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(audio.contentLength),
      'Cache-Control': MEDIA_CACHE_CONTROL,
    };
    if (audio.contentRange) {
      headers['Content-Range'] = audio.contentRange;
    }
    return { stream: audio.body, status: audio.contentRange ? 206 : 200, headers };
  }
}
