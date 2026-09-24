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
import type { ApiSuccess, LessonRecordingView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { RecordingService } from './recording.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('recording')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons/:lessonId/recording')
export class RecordingController {
  constructor(private readonly recording: RecordingService) {}

  @Get()
  @ApiOperation({
    summary: "Read a lesson's recording",
    description: 'Caller-scoped: `mine` reflects only the caller\'s own recording, never another participant\'s.',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The recording view.', schema: dataEnvelope('LessonRecordingView') })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonRecordingView>> {
    return { data: await this.recording.getView(lessonId, user.id) };
  }

  @Post('retry')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Retry recording verification',
    description:
      'Moves every retryable branch of the lesson back to verifying and the lesson back to finalizing, ' +
      'skipping the egress settle wait.',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 202, description: 'Retry accepted.', schema: dataEnvelope('LessonRecordingView') })
  @ApiResponse({
    status: 409,
    description:
      'REC001: nothing in this lesson\'s recording is retryable. REC002: the recording is still being ' +
      'captured or finalized.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async retry(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonRecordingView>> {
    return { data: await this.recording.retry(lessonId, user.id) };
  }
}
