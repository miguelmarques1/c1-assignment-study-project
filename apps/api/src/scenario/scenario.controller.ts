import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ApiSuccess, ScenarioView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { ScenarioService } from './scenario.service';

@ApiTags('scenario')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('classroom/scenario')
export class ScenarioController {
  constructor(private readonly scenario: ScenarioService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the current scenario',
    description:
      'The shared situation plus only the caller\'s own role card — never any other ' +
      "participant's card, in any response shape. Null when no lesson is open.",
  })
  @ApiResponse({ status: 200, description: 'The scenario, or null.', schema: dataEnvelope('ScenarioView') })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async read(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<ScenarioView>> {
    return { data: await this.scenario.read(user.id) };
  }

  @Post('reroll')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reroll the situation',
    description:
      'Regenerates the shared situation and every registered participant\'s role card, each ' +
      'with its own owner\'s key. Only the participant who opened the room may call this, up to ' +
      '3 times, and only before the lesson starts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset to pending; the client keeps polling until ready.',
    schema: dataEnvelope('ScenarioView'),
  })
  @ApiResponse({
    status: 409,
    description: 'SCEN001: all 3 rerolls used.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({
    status: 409,
    description: 'SCEN002: the lesson has already started; the scenario is immutable.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 403, description: 'SCEN003: the caller did not open the room.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'CLASS003: no lesson is open.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async reroll(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<ScenarioView>> {
    return { data: await this.scenario.reroll(user.id) };
  }

  @Post('retry')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Retry a failed situation',
    description:
      'Backs the "Try again" action after a failed generation. Does not consume a reroll — a ' +
      'failed generation produced no situation to replace.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset to pending; the client keeps polling until ready.',
    schema: dataEnvelope('ScenarioView'),
  })
  @ApiResponse({
    status: 409,
    description: 'SCEN002: the lesson has already started.',
    ...ERROR_RESPONSE,
  })
  @ApiResponse({ status: 403, description: 'SCEN003: the caller did not open the room.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 409, description: 'CLASS003: no lesson is open.', ...ERROR_RESPONSE })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async retry(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<ScenarioView>> {
    return { data: await this.scenario.retry(user.id) };
  }
}
