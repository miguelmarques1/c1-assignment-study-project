import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  LESSON_LIST_DEFAULT_LIMIT,
  LESSON_LIST_MAX_LIMIT,
  lessonListQuerySchema,
  type ApiSuccess,
  type LessonDetailView,
  type LessonList,
  type LessonListQuery,
} from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { LessonHistoryService } from './lesson-history.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('lessons')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons')
export class LessonsController {
  constructor(private readonly history: LessonHistoryService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller's lessons",
    description:
      'Every lesson the caller took part in that started and ended, newest first, keyset-paginated. Each row ' +
      "carries the caller's own processing status (never another participant's), its flags, the active stage or " +
      "the reason when there is one, and — once ready — a one-line headline of the caller's own change.",
  })
  @ApiQuery({ name: 'cursor', required: false, type: 'string', description: "The previous page's `nextCursor`." })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'integer',
    description: `Page size, 1–${LESSON_LIST_MAX_LIMIT} (default ${LESSON_LIST_DEFAULT_LIMIT}).`,
  })
  @ApiResponse({ status: 200, description: 'One page of the history.', schema: dataEnvelope('LessonList') })
  @ApiResponse({
    status: 400,
    description: 'VAL001: `limit` out of range, or a cursor this API did not issue.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async list(
    @Query(new ZodValidationPipe(lessonListQuerySchema)) query: LessonListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonList>> {
    return { data: await this.history.list(user.id, query) };
  }

  @Get(':lessonId')
  @ApiOperation({
    summary: "Read one lesson's summary and processing overview",
    description:
      "The same summary as a list row, plus the scenario step (the caller's own card status only) and every " +
      "other participant's stages as coarse states — no reason, provider message, progress or retry for anyone " +
      'but the caller.',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'The lesson summary.', schema: dataEnvelope('LessonDetailView') })
  @ApiResponse({
    status: 403,
    description: 'CLASS004: the caller is not a participant of that lesson, or it is not in the history.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async detail(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonDetailView>> {
    return { data: await this.history.detail(lessonId, user.id) };
  }
}
