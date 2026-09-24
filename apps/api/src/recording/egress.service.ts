import { Injectable } from '@nestjs/common';
import {
  DirectFileOutput,
  EgressClient,
  S3Upload,
  type EgressInfo,
} from 'livekit-server-sdk';

import { env } from '../config/env';
import { CLASSROOM_ROOM_NAME } from '../classroom/classroom.constants';

/**
 * Thrown by every method below on a transport failure, so a caller never has
 * to parse an SDK error to know what happened — same shape as
 * `LiveKitService.classroomUnavailable`, but this one has no HTTP request to
 * answer: the orchestrator and finalizer decide what a failure means.
 */
export class EgressUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Egress could not be reached.');
    this.name = 'EgressUnavailableError';
    this.cause = cause;
  }
}

/**
 * The only place that talks to the LiveKit egress API. Every call is wrapped
 * so a transport failure becomes `EgressUnavailableError` rather than a raw
 * SDK error reaching the orchestrator — same discipline as `LiveKitService`.
 */
@Injectable()
export class EgressService {
  private readonly egress: EgressClient;

  constructor() {
    const config = env();
    this.egress = new EgressClient(config.LIVEKIT_URL, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  /**
   * Starts a track egress for one audio track, writing an Ogg/Opus segment
   * directly to object storage. `disableManifest` is set because egress
   * otherwise uploads a `.json` manifest alongside the media file, which
   * would break "every object under this lesson is audio" — a criterion
   * this feature's own tests assert.
   */
  async startTrackEgress(params: { trackId: string; objectKey: string }): Promise<EgressInfo> {
    const config = env();
    const output = new DirectFileOutput({
      filepath: params.objectKey,
      disableManifest: true,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: config.S3_ACCESS_KEY,
          secret: config.S3_SECRET_KEY,
          region: config.S3_REGION,
          endpoint: config.EGRESS_S3_ENDPOINT ?? config.S3_ENDPOINT,
          bucket: config.S3_BUCKET,
          forcePathStyle: true,
        }),
      },
    });

    try {
      return await this.egress.startTrackEgress(CLASSROOM_ROOM_NAME, output, params.trackId);
    } catch (error) {
      throw new EgressUnavailableError(error);
    }
  }

  async stopEgress(egressId: string): Promise<EgressInfo> {
    try {
      return await this.egress.stopEgress(egressId);
    } catch (error) {
      throw new EgressUnavailableError(error);
    }
  }

  /** Every egress LiveKit currently knows about for the classroom room — used to reconcile a straggler. */
  async listEgress(): Promise<EgressInfo[]> {
    try {
      return await this.egress.listEgress({ roomName: CLASSROOM_ROOM_NAME });
    } catch (error) {
      throw new EgressUnavailableError(error);
    }
  }
}
