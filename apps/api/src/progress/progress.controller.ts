import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ApiSuccess, ProgressDashboardView } from '@english-quest/shared';

import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';
import { dataEnvelope, ERROR_RESPONSE } from '../openapi/components';
import { BEARER_SECURITY_SCHEME, SESSION_SECURITY_SCHEME } from '../openapi/setup';
import { ProgressService } from './progress.service';

@ApiTags('progress')
@ApiCookieAuth(SESSION_SECURITY_SCHEME)
@ApiBearerAuth(BEARER_SECURITY_SCHEME)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  @ApiOperation({
    summary: "Read the caller's progress dashboard",
    description:
      "The caller's learning profile, exactly as `GET /profile` returns it, plus the history behind the " +
      "competency chart: each competency's newest 20 measurements (the smoothed score after each, oldest " +
      'first, lesson or activity), the boundaries of the `all`, `90d` and `30d` ranges and whether the ' +
      "chart has enough data to draw. The caller's own data only; the route takes no parameter.",
  })
  @ApiResponse({ status: 200, description: "The caller's progress dashboard.", schema: dataEnvelope('ProgressDashboardView') })
  @ApiResponse({ status: 401, description: 'AUTH003: no valid session.', ...ERROR_RESPONSE })
  async get(@CurrentUser() user: AuthenticatedUser): Promise<ApiSuccess<ProgressDashboardView>> {
    return { data: await this.progress.getDashboard(user.id) };
  }
}
