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
import type { ApiSuccess, ClassroomEndResult, ClassroomSession, ClassroomToken } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { ClassroomService } from './classroom.service';

const lessonIdParamPipe = new ZodValidationPipe(z.uuid());

@ApiTags('classroom')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  @Post('token')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a classroom token',
    description:
      'Opens the room\'s lesson if none is open, checks live occupancy against the configured ' +
      'cap before anything is issued, and returns a signed LiveKit token valid for 6 hours.',
  })
  @ApiResponse({ status: 200, description: 'Token issued.', schema: dataEnvelope('ClassroomToken') })
  @ApiResponse({
    status: 409,
    description: 'CLASS001: the room is at the configured cap.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({
    status: 503,
    description: 'CLASS002: LiveKit could not be reached. No lesson row is committed.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async requestToken(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<ClassroomToken>> {
    return { data: await this.classroom.requestToken(user) };
  }

  @Get('session')
  @ApiOperation({
    summary: 'Read the open classroom session',
    description: 'Answers only "is a lesson open right now" — null when nothing is open.',
  })
  @ApiResponse({
    status: 200,
    description: 'The open session, or null.',
    schema: dataEnvelope('ClassroomSession'),
  })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async session(): Promise<ApiSuccess<ClassroomSession>> {
    return { data: await this.classroom.session() };
  }

  @Post(':lessonId/end')
  @HttpCode(200)
  @ApiOperation({
    summary: 'End the lesson',
    description: 'Any connected participant may end the lesson for everyone.',
  })
  @ApiParam({ name: 'lessonId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ended.', schema: dataEnvelope('ClassroomEndResult') })
  @ApiResponse({
    status: 403,
    description: 'CLASS004: the caller is not a participant of that lesson.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({
    status: 409,
    description: 'CLASS003: the lesson is already in a terminal state.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 400, description: 'VAL001: lessonId is not a valid UUID.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async end(
    @Param('lessonId', lessonIdParamPipe) lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiSuccess<ClassroomEndResult>> {
    return { data: await this.classroom.endLesson(lessonId, user.id) };
  }
}
