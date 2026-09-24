import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiSuccess, LessonTranscriptView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { TranscriptService } from './transcript.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('transcript')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons/:lessonId/transcript')
export class TranscriptController {
  constructor(private readonly transcript: TranscriptService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the merged lesson transcript',
    description:
      "Every participant's utterances in one conversation, in milliseconds from the lesson's start. " +
      "Recognition confidence and word timings appear only on the caller's own utterances, and another " +
      "participant's status is only `available`, `pending` or `unavailable`, never the reason. " +
      "The caller's own utterances chosen for pronunciation assessment carry `excerpt`, with why they were " +
      'chosen, and `myExcerptSelection` summarizes the caller\'s selection (null until it has run).',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The merged transcript.', schema: dataEnvelope('LessonTranscriptView') })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonTranscriptView>> {
    return { data: await this.transcript.getView(lessonId, user.id) };
  }
}
