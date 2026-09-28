import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  saveWritingDraftSchema,
  submitWritingSchema,
  type ApiSuccess,
  type SaveWritingDraftInput,
  type SubmitWritingInput,
  type WritingActivityView,
  type WritingDraftSaved,
} from '@english-quest/shared';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { WritingActivityService } from './writing-activity.service';
import { WritingSubmissionService } from './writing-submission.service';

const activityIdParamPipe = new ZodValidationPipe(z.uuid());

/**
 * The runner for a plan's `writing` activities (F17 §5). `:activityId` is
 * resolved forward through F15's carry-over lineage, so an older id (a
 * carried-over device, a stale bookmark) still reaches the same task.
 */
@ApiTags('writing')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('activities/:activityId/writing')
export class WritingController {
  constructor(
    private readonly activityService: WritingActivityService,
    private readonly submissionService: WritingSubmissionService,
  ) {}

  @Post('open')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Open a writing activity',
    description:
      'On the first open of an active plan, composes and stores the task and marks the activity started. Every ' +
      'later open — from any device, or an older id in the lineage — returns the same task. On an archived plan ' +
      'it returns the existing task read-only, or PLAN004 when no task was ever opened.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The writing activity.', schema: dataEnvelope('WritingActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: activityId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003: no writing activity with this id for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'PLAN004: the plan was replaced and this activity was never opened.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async open(
    @Param('activityId', activityIdParamPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<WritingActivityView>> {
    return { data: await this.activityService.open(user.id, activityId, new Date()) };
  }

  @Get()
  @ApiOperation({
    summary: 'Read a writing activity',
    description: 'Read-only, with no state change. Both clients poll this while the task is `correcting`.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The writing activity.', schema: dataEnvelope('WritingActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001: activityId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 or WRIT001: unknown, or never opened.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async read(
    @Param('activityId', activityIdParamPipe) activityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<WritingActivityView>> {
    return { data: await this.activityService.read(user.id, activityId, new Date()) };
  }

  @Put('draft')
  @ApiOperation({
    summary: 'Save the draft',
    description:
      'A compare-and-set save by revision. A stale `baseRevision` whose text differs from the server copy is ' +
      'rejected with that copy attached (WRIT004); the identical text at a stale revision succeeds idempotently. ' +
      'Moves `uncorrected`/`correction_failed` back to `draft`.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiBody({ schema: { $ref: '#/components/schemas/SaveWritingDraftRequest' } })
  @ApiResponse({ status: 200, description: 'The accepted revision.', schema: dataEnvelope('WritingDraftSaved') })
  @ApiResponse({ status: 400, description: 'VAL001: body or path invalid.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 or WRIT001.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'PLAN004, WRIT004 (details.draft carries the server copy) or WRIT007.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async saveDraft(
    @Param('activityId', activityIdParamPipe) activityId: string,
    @Body(new ZodValidationPipe(saveWritingDraftSchema)) body: SaveWritingDraftInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<WritingDraftSaved>> {
    return {
      data: await this.activityService.saveDraft(
        user.id,
        activityId,
        { text: body.text, baseRevision: body.baseRevision, activeSecondsDelta: body.activeSecondsDelta },
        new Date(),
      ),
    };
  }

  @Post('submit')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Submit for correction',
    description:
      'Checks the Gemini key, the rolling daily limit, the revision and the word count, then starts the ' +
      'correction in the background and returns immediately with status `correcting`. `submissionId` is the ' +
      'idempotency key: a repeated id returns the current view without creating a second correction.',
  })
  @ApiParam({ name: 'activityId', type: 'string', format: 'uuid' })
  @ApiBody({ schema: { $ref: '#/components/schemas/SubmitWritingRequest' } })
  @ApiResponse({ status: 200, description: 'The writing activity, now correcting.', schema: dataEnvelope('WritingActivityView') })
  @ApiResponse({ status: 400, description: 'VAL001, WRIT005 (too short) or WRIT006 (too long).', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN003 or WRIT001.', ...ERROR_RESPONSE })
  @ApiResponse({
    status: 409,
    description: 'PLAN004, WRIT002 (no usable key), WRIT004 (stale revision) or WRIT007 (already submitted).',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 429, description: 'WRIT003: the rolling daily limit is reached.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async submit(
    @Param('activityId', activityIdParamPipe) activityId: string,
    @Body(new ZodValidationPipe(submitWritingSchema)) body: SubmitWritingInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<WritingActivityView>> {
    return { data: await this.submissionService.submit(user.id, activityId, body, new Date()) };
  }
}
