import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiSuccess, CurrentPlanView, PlanHistoryView, StudyPlanView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { PlanHistoryReader } from './plan-history.reader';
import { PlanReadService } from './plan-read.service';
import { PlanRetryService } from './plan-retry.service';

const planIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('plans')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('plans')
export class PlansController {
  constructor(
    private readonly reads: PlanReadService,
    private readonly history: PlanHistoryReader,
    private readonly retry: PlanRetryService,
  ) {}

  @Get('current')
  @ApiOperation({
    summary: "Read the caller's current study plan",
    description:
      "The active plan, or null when the caller has none yet. `preparing` is set while a build that will " +
      'replace (or create) the active plan is in progress, with F14 generation progress when it is running. ' +
      '`failure` is set when the newest such build failed, and is null while `preparing` is set.',
  })
  @ApiResponse({ status: 200, description: "The caller's current plan.", schema: dataEnvelope('CurrentPlanView') })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async current(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<CurrentPlanView>> {
    return { data: await this.reads.currentFor(user.id, new Date()) };
  }

  @Get()
  @ApiOperation({
    summary: "List the caller's plans",
    description: 'Up to the 100 newest plans, active and archived, newest first, each with its own completion statistics.',
  })
  @ApiResponse({ status: 200, description: "The caller's plan history.", schema: dataEnvelope('PlanHistoryView') })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<PlanHistoryView>> {
    return { data: { plans: await this.history.completionHistoryFor(user.id) } };
  }

  @Get(':planId')
  @ApiOperation({
    summary: "Read one of the caller's plans",
    description: "Any of the caller's own plans, active or archived, by id.",
  })
  @ApiParam({ name: 'planId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The plan.', schema: dataEnvelope('StudyPlanView') })
  @ApiResponse({ status: 400, description: 'VAL001: planId is not a UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 404, description: 'PLAN001: no such plan for the caller.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async detail(
    @Param('planId', planIdParamPipe) planId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<StudyPlanView>> {
    return { data: await this.reads.planFor(user.id, planId) };
  }

  @Post('retry')
  @HttpCode(200)
  @ApiOperation({
    summary: "Retry the caller's failed plan build",
    description:
      "Retries exactly the build `GET /plans/current` reports as `failure`. A `lesson`-origin failure is retried " +
      'through the pipeline; a `recording_failed` or `analysis_blocked` failure is reset for the request job to pick up again.',
  })
  @ApiResponse({ status: 200, description: 'The current plan view, now preparing.', schema: dataEnvelope('CurrentPlanView') })
  @ApiResponse({ status: 409, description: 'PLAN002: there is no failed plan build to retry.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async retryFailed(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<CurrentPlanView>> {
    return { data: await this.retry.retry(user.id) };
  }
}
