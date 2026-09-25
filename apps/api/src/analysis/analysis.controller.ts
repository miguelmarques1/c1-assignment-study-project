import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiSuccess, LessonAnalysisView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { AnalysisService } from './analysis.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('analysis')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons/:lessonId/analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get()
  @ApiOperation({
    summary: "Read the caller's lesson analysis",
    description:
      "The caller's own truthful state (`pending`, `ready`, `failed` or `unavailable`) and, when ready, " +
      'their five competency scores with deltas against their previous analysed lesson, errors grouped by ' +
      "severity with taxonomy labels, the scenario-fit block and topics to practice. Never another participant's data.",
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: "The caller's lesson analysis.", schema: dataEnvelope('LessonAnalysisView') })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonAnalysisView>> {
    return { data: await this.analysis.getView(lessonId, user.id) };
  }
}
