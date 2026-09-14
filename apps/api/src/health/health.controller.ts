import { Controller, Get, Res } from '@nestjs/common';
import type { ApiSuccess, HealthReport } from '@english-quest/shared';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Unauthenticated by design: it has to be reachable before and independently
   * of a working session, and it exposes no user data.
   *
   * Returns 503 when any dependency is down, but still serves the full report
   * so the caller learns which one.
   */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<ApiSuccess<HealthReport>> {
    const report = await this.health.check();

    response.status(report.status === 'ok' ? 200 : 503);

    return { data: report };
  }
}
