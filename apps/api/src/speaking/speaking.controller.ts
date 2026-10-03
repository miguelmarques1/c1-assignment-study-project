import type { IncomingMessage } from 'node:http';

import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Req, Res, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { speakingRatingInputSchema, type ApiSuccess, type SpeakingActivityView, type SpeakingAttemptView, type SpeakingRatingInput, type SpeakingRatingView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { AppError } from '../common/app-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { SpeakingActivityService } from './speaking-activity.service';
import { SpeakingAttemptService } from './speaking-attempt.service';

const uuidPipe = new ZodValidationPipe(z.uuid());
const ratingBodyPipe = new ZodValidationPipe(speakingRatingInputSchema);

const CLIENT_ATTEMPT_ID_HEADER = 'x-client-attempt-id';

function requireClientAttemptId(headerValue: string | undefined): string {
  const parsed = z.uuid().safeParse(headerValue);
  if (!parsed.success) {
    throw AppError.validationFailed([{ path: 'X-Client-Attempt-Id', message: 'must be a UUID' }]);
  }
  return parsed.data;
}

/**
 * The five caller-only routes for a speaking or pronunciation activity
 * (spec §5). Every response carries only the caller's own data: an
 * activity, task or attempt id belonging to another user is
 * indistinguishable from an unknown one.
 */
@ApiTags('speaking')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('speaking')
export class SpeakingController {
  constructor(
    private readonly activities: SpeakingActivityService,
    private readonly attempts: SpeakingAttemptService,
  ) {}

  @Get('activities/:activityId')
  @ApiOperation({
    summary: 'Read a speaking activity',
    description:
      'Resolves `activityId` forward through its carry-over lineage. The first read of an active plan’s ' +
      'activity materializes its task from the versioned corpus; it never changes plan state and never calls Azure.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The activity, its task and every retained attempt.', schema: dataEnvelope('SpeakingActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: activityId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 (no such activity) or SPEAK001 (not a speaking activity).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async activity(
    @Param('activityId', uuidPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<SpeakingActivityView>> {
    return { data: await this.activities.viewFor(user.id, activityId, new Date()) };
  }

  @Post('activities/:activityId/attempts')
  @ApiConsumes('audio/wav')
  @ApiHeader({ name: 'X-Client-Attempt-Id', required: true, description: 'UUID v4, generated once per recording and resent unchanged on retry.' })
  @ApiOperation({
    summary: 'Upload and score a recording',
    description:
      'The body is the raw WAV file (16 kHz mono 16-bit PCM), capped at 120 s and 4 MiB. Scores synchronously and ' +
      'answers with the attempt: 201 for a new attempt (scored, discarded or failed), 200 when the client attempt ' +
      'id has already been recorded.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'The new attempt.', schema: dataEnvelope('SpeakingAttemptView') })
  @ApiResponse({ status: 200, description: 'The previously recorded attempt for this client attempt id.', schema: dataEnvelope('SpeakingAttemptView') })
  @ApiResponse({ status: 400, description: 'VAL001 (bad header or id) or SPEAK003 (not a 16 kHz mono 16-bit WAV).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 or SPEAK001.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'PLAN004, SPEAK009, CRED002, SPEAK002 or SPEAK007.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 413, description: 'SPEAK004: longer than 2 minutes or larger than 4 MiB.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 503, description: 'SPEAK008: the recording could not be stored.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async upload(
    @Param('activityId', uuidPipe) activityId: string,
    @Headers(CLIENT_ATTEMPT_ID_HEADER) clientAttemptIdHeader: string | undefined,
    @Req() req: IncomingMessage,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiSuccess<SpeakingAttemptView>> {
    const clientAttemptId = requireClientAttemptId(clientAttemptIdHeader);
    const { view, status } = await this.attempts.upload(user.id, activityId, clientAttemptId, req, new Date());
    res.status(status);
    return { data: view };
  }

  @Post('attempts/:attemptId/rescore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Re-score a failed attempt from its stored recording',
    description: 'No body. The attempt must be `failed` with a re-scorable code, or `scoring` past its lease.',
  })
  @ApiParam({ name: 'attemptId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The attempt, now scored, discarded or failed again.', schema: dataEnvelope('SpeakingAttemptView') })
  @ApiResponse({ status: 400, description: 'VAL001: attemptId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'SPEAK005: no such attempt for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'SPEAK006, SPEAK002, SPEAK007, PLAN004 or CRED002.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async rescore(
    @Param('attemptId', uuidPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<SpeakingAttemptView>> {
    return { data: await this.attempts.rescore(user.id, attemptId, new Date()) };
  }

  @Get('attempts/:attemptId/audio')
  @ApiProduces('audio/wav')
  @ApiOperation({ summary: "Stream an attempt's stored recording", description: 'Allowed on an archived plan, for replay.' })
  @ApiParam({ name: 'attemptId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The stored WAV bytes.' })
  @ApiResponse({ status: 400, description: 'VAL001: attemptId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'SPEAK005: no such attempt for the caller, or a discarded attempt with no audio.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async audio(
    @Param('attemptId', uuidPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const bytes = await this.attempts.audioFor(user.id, attemptId);
    res.set({ 'Cache-Control': 'private, no-store' });
    return new StreamableFile(bytes, { type: 'audio/wav' });
  }

  @Put('activities/:activityId/rating')
  @ApiOperation({ summary: 'Rate a speaking activity', description: "F15's difficulty rating (A24)." })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The stored rating.', schema: dataEnvelope('SpeakingRatingView') })
  @ApiResponse({ status: 400, description: 'VAL001: bad body, or the activity is not completed.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 or SPEAK001.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async rate(
    @Param('activityId', uuidPipe) activityId: string,
    @Body(ratingBodyPipe) body: SpeakingRatingInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<SpeakingRatingView>> {
    return { data: await this.activities.rate(user.id, activityId, body) };
  }
}
