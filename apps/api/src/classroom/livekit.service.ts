import { Injectable } from '@nestjs/common';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type ParticipantInfo,
  type WebhookEvent,
} from 'livekit-server-sdk';

import { AppError } from '../common/app-error';
import { env } from '../config/env';
import { CLASSROOM_TOKEN_TTL_SECONDS } from './classroom.constants';

/**
 * The only place that talks to the LiveKit server. Every call is wrapped so a
 * transport failure becomes CLASS002 rather than a raw SDK error reaching a
 * controller — and, per the spec's own test, the reason carried in `details`
 * is always the fixed wording below, never the SDK's own message.
 */
@Injectable()
export class LiveKitService {
  private readonly rooms: RoomServiceClient;
  private readonly webhooks: WebhookReceiver;

  constructor() {
    const config = env();
    this.rooms = new RoomServiceClient(
      config.LIVEKIT_URL,
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    );
    this.webhooks = new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  /** Idempotent for an existing room; gives LiveKit itself a second line of cap enforcement. */
  async createRoom(name: string, maxParticipants: number): Promise<void> {
    try {
      await this.rooms.createRoom({ name, maxParticipants });
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async listParticipants(room: string): Promise<ParticipantInfo[]> {
    try {
      return await this.rooms.listParticipants(room);
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async deleteRoom(room: string): Promise<void> {
    try {
      await this.rooms.deleteRoom(room);
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async issueAccessToken(params: {
    identity: string;
    name: string;
    room: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const config = env();
    const issuedAt = new Date();
    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: params.identity,
      name: params.name,
      ttl: CLASSROOM_TOKEN_TTL_SECONDS,
    });
    at.addGrant({
      roomJoin: true,
      room: params.room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    return {
      token,
      expiresAt: new Date(issuedAt.getTime() + CLASSROOM_TOKEN_TTL_SECONDS * 1000),
    };
  }

  /** Throws AUTH003 on any verification failure; no state is changed by the caller in that case. */
  async verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent> {
    try {
      return await this.webhooks.receive(rawBody, authHeader);
    } catch {
      throw AppError.sessionInvalid();
    }
  }

  private unavailable(_error: unknown): AppError {
    return AppError.classroomUnavailable('LiveKit server not reachable');
  }
}
