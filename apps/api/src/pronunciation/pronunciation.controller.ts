import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiSuccess, LessonPronunciationView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { PronunciationService } from './pronunciation.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('pronunciation')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons/:lessonId/pronunciation')
export class PronunciationController {
  constructor(private readonly pronunciation: PronunciationService) {}

  @Get()
  @ApiOperation({
    summary: "Read the caller's pronunciation assessment",
    description:
      "The caller's own truthful state (`pending`, `assessed`, `no_sample`, `failed` or `unavailable`), " +
      'their result when assessed — duration-weighted scores, the 5 worst phonemes and 10 worst words, ' +
      'flags and notes — and every one of their selected excerpts with its own status and scores. Never ' +
      "another participant's data.",
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: "The caller's pronunciation view.", schema: dataEnvelope('LessonPronunciationView') })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonPronunciationView>> {
    return { data: await this.pronunciation.getView(lessonId, user.id) };
  }
}
