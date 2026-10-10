import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  activityRatingInputSchema,
  activitySkipInputSchema,
  objectiveSubmissionInputSchema,
  type ActivityRatingInput,
  type ActivityRatingView,
  type ActivitySkipInput,
  type ActivityView,
  type ApiSuccess,
  type ObjectiveSubmissionInput,
} from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { ActivityActionsService } from './activity-actions.service';
import { ActivityMediaService } from './activity-media.service';
import { ActivityViewService } from './activity-view.service';
import { ObjectiveAttemptService } from './objective-attempt.service';

const uuidPipe = new ZodValidationPipe(z.uuid());
const submissionPipe = new ZodValidationPipe(objectiveSubmissionInputSchema);
const skipPipe = new ZodValidationPipe(activitySkipInputSchema);
const ratingPipe = new ZodValidationPipe(activityRatingInputSchema);

/**
 * The six caller-only routes behind the objective activity runner (F16).
 * Every response carries only the caller's own data: an activity or attempt
 * id belonging to another user is indistinguishable from an unknown one.
 */
@ApiTags('activities')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly views: ActivityViewService,
    private readonly attempts: ObjectiveAttemptService,
    private readonly actions: ActivityActionsService,
    private readonly media: ActivityMediaService,
  ) {}

  @Get(':activityId')
  @ApiOperation({
    summary: 'Read an activity',
    description:
      'Resolves `activityId` forward through its carry-over lineage. For the five bank kinds it carries the item with its ' +
      'questions and never an answer, explanation, listening transcript or source before a submission. It has no side ' +
      'effects: opening an activity consumes nothing.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The activity, its session and its item.', schema: dataEnvelope('ActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: activityId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 (no such activity) or CONTENT001.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async activity(
    @Param('activityId', uuidPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<ActivityView>> {
    return { data: await this.views.viewFor(user.id, activityId, new Date()) };
  }

  @Post(':activityId/attempts')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start (or resume) the attempt',
    description:
      'Called on the first interaction. Idempotent: an open attempt anywhere in the lineage is returned as it is, a ' +
      'completed activity returns its graded attempt, and otherwise the item’s questions are snapshotted into a new ' +
      'attempt and the plan activity moves to `in_progress`.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The activity with `objective.attempt` set.', schema: dataEnvelope('ActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: activityId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003: no such activity for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'PLAN004, ACT001 (not an objective activity), ACT003 (skipped) or ACT006 (nothing can be corrected).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async start(
    @Param('activityId', uuidPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<ActivityView>> {
    return { data: await this.attempts.start(user.id, activityId, new Date()) };
  }

  @Put(':activityId/attempts/:attemptId/submission')
  @ApiOperation({
    summary: 'Submit an attempt',
    description:
      'Grades the answers against the attempt’s question snapshot, stores the result, writes the outcome into the ' +
      'learner’s profile and completes the plan activity, in one transaction. Idempotent: a repeat, from a double tap, ' +
      'a retry or another device, returns the stored result and ignores its body.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'attemptId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The activity with `objective.result` set.', schema: dataEnvelope('ActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: bad ids or body, a missing, duplicated or malformed answer, or a fingerprint that is not the attempt’s.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 (no such activity) or ACT002 (no such attempt).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'ACT001 (not an objective activity) or ACT003 (the activity was skipped).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async submit(
    @Param('activityId', uuidPipe) activityId: string,
    @Param('attemptId', uuidPipe) attemptId: string,
    @Body(submissionPipe) body: ObjectiveSubmissionInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<ActivityView>> {
    return { data: await this.attempts.submit(user.id, activityId, attemptId, body, new Date()) };
  }

  @Post(':activityId/skip')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Skip an activity (any kind)',
    description: 'Records the reason through the plan contract and abandons an open objective attempt. Nothing is written to the ledger. Skipping a completed or skipped activity is a no-op.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The activity, now skipped.', schema: dataEnvelope('ActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: the reason is empty or too long.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003: no such activity for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'PLAN004: the plan was replaced and the activity was not carried forward.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async skip(
    @Param('activityId', uuidPipe) activityId: string,
    @Body(skipPipe) body: ActivitySkipInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<ActivityView>> {
    return { data: await this.actions.skip(user.id, activityId, body.reason, new Date()) };
  }

  @Put(':activityId/rating')
  @ApiOperation({
    summary: 'Rate a completed activity (any kind)',
    description: 'Stored on the plan activity and, for an objective activity, on its graded attempt beside the item’s prompt version. Archived plans are allowed. Rating again overwrites.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The stored rating.', schema: dataEnvelope('ActivityRatingView') })
  @ApiResponse({ status: 400, description: 'VAL001: an invalid body, or the activity is not completed.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003: no such activity for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async rate(
    @Param('activityId', uuidPipe) activityId: string,
    @Body(ratingPipe) body: ActivityRatingInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<ActivityRatingView>> {
    return { data: await this.actions.rate(user.id, activityId, body, new Date()) };
  }

  @Get(':activityId/media')
  @ApiProduces('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg')
  @ApiHeader({ name: 'Range', required: false, description: 'A single `bytes=start-end` range. Ignored when unparseable or unsatisfiable.' })
  @ApiOperation({
    summary: 'Stream a listening activity’s audio',
    description: 'Checks ownership, then streams the object through the API with HTTP byte ranges. Allowed in any activity state.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The whole audio object.' })
  @ApiResponse({ status: 206, description: 'The requested byte range.' })
  @ApiResponse({ status: 400, description: 'VAL001: activityId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 (no such activity) or ACT004 (no audio).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 503, description: 'ACT005: the object store could not be reached.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async audio(
    @Param('activityId', uuidPipe) activityId: string,
    @Headers('range') range: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const audio = await this.media.open(user.id, activityId, range);
    res.status(audio.status);
    res.set(audio.headers);
    return new StreamableFile(audio.stream);
  }
}
