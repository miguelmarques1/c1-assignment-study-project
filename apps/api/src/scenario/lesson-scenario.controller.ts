import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { ApiSuccess, LessonScenarioView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { ScenarioService } from './scenario.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

/**
 * A past lesson's scenario (F19). F06's `GET /classroom/scenario` only ever
 * reads the open lesson; this reads any lesson the caller took part in,
 * through the same builder, so "only the caller's own card" stays one rule.
 */
@ApiTags('scenario')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('lessons/:lessonId/scenario')
export class LessonScenarioController {
  constructor(private readonly scenario: ScenarioService) {}

  @Get()
  @ApiOperation({
    summary: "Read a past lesson's scenario",
    description:
      "The shared situation in full plus only the caller's own role card, as they were before the lesson — " +
      "never another participant's card, in any response shape. `situation` is null unless it was ready.",
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: "The lesson's scenario.", schema: dataEnvelope('LessonScenarioView') })
  @ApiResponse({ status: 403, description: 'CLASS004: the caller is not a participant of that lesson.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async read(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<LessonScenarioView>> {
    return { data: await this.scenario.readForLesson(lessonId, user.id) };
  }
}
