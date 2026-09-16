import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../auth/public.decorator';
import { ERROR_RESPONSE } from '../openapi/components';
import { LessonLifecycleService } from './lesson-lifecycle.service';
import { LiveKitService } from './livekit.service';

/**
 * LiveKit's own callback surface. Authenticated by LiveKit's signature over
 * the raw request body, never by the session guard — `@Public()` opts this
 * one route out of it on purpose.
 */
@ApiTags('classroom')
@Controller('classroom')
export class ClassroomWebhookController {
  constructor(
    private readonly liveKit: LiveKitService,
    private readonly lifecycle: LessonLifecycleService,
  ) {}

  @Public()
  @Post('livekit-webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'LiveKit lifecycle webhook',
    description:
      'Receives participant_joined, participant_left and room_finished. Every other event ' +
      'type is acknowledged and ignored. Authenticated by the Authorization header signature ' +
      'over a SHA-256 checksum of the raw body, verified with WebhookReceiver — never by session.',
  })
  @ApiResponse({ status: 200, description: 'Acknowledged.' })
  @ApiResponse({
    status: 401,
    description: 'AUTH003: missing, malformed or invalid signature; no state is changed.',
    ...ERROR_RESPONSE,
  })
  async handle(@Req() request: Request): Promise<{ data: { received: true } }> {
    const rawBody = request.body as Buffer;
    const event = await this.liveKit.verifyWebhook(
      rawBody.toString('utf8'),
      request.get('Authorization'),
    );

    switch (event.event) {
      case 'participant_joined':
        await this.lifecycle.applyParticipantJoined(event);
        break;
      case 'participant_left':
        await this.lifecycle.applyParticipantLeft(event);
        break;
      case 'room_finished':
        await this.lifecycle.applyRoomFinished(event);
        break;
      default:
        // Acknowledged and ignored, so enabling more LiveKit events later
        // never returns an error to the server.
        break;
    }

    return { data: { received: true } };
  }
}
