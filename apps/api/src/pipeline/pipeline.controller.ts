import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiSuccess, LessonPipelineView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { PipelineService } from './pipeline.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('pipeline')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons/:lessonId/pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  @ApiOperation({
    summary: "Read the caller's pipeline",
    description:
      "Every stage the caller's own branch has reached, with its state, timing, attempts and, when " +
      'blocked or failed, the reason. Never carries another participant\'s branch.',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The pipeline view.', schema: dataEnvelope('LessonPipelineView') })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonPipelineView>> {
    return { data: await this.pipeline.getView(lessonId, user.id) };
  }

  @Post('retry')
  @HttpCode(202)
  @ApiOperation({
    summary: "Retry the caller's failed stage",
    description:
      "Re-runs the caller's own failed stage from transcription onward; downstream stages re-run as the " +
      'branch advances and upstream results are reused. A blocked stage resumes by itself once a usable key ' +
      'is saved, so it is not retryable here.',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 202, description: 'Retry accepted.', schema: dataEnvelope('LessonPipelineView') })
  @ApiResponse({
    status: 409,
    description:
      'PIPE001: nothing to retry — no branch, or the current stage has not failed. PIPE002: the branch ' +
      "failed at recording; `details.retryRoute` names that feature's retry.",
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async retry(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonPipelineView>> {
    return { data: await this.pipeline.retry(lessonId, user.id) };
  }
}
