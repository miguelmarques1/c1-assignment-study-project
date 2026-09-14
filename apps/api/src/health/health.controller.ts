import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ApiSuccess, HealthReport } from '@english-quest/shared';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { dataEnvelope } from '../openapi/components';
import { HealthService } from './health.service';

@ApiTags('health')
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
  @ApiOperation({
    summary: 'Dependency health',
    description:
      'Probes PostgreSQL, Redis, MinIO and LiveKit independently. Unauthenticated, because it ' +
      'must be reachable before a session exists. Answers 503 when any probe fails, but still ' +
      'returns the full report so the caller learns which one.',
  })
  @ApiResponse({ status: 200, description: 'Every dependency is up.', schema: dataEnvelope('HealthReport') })
  @ApiResponse({
    status: 503,
    description: 'HEALTH001: at least one dependency is down; the body still lists every probe.',
    schema: dataEnvelope('HealthReport'),
  })
  async check(@Res({ passthrough: true }) response: Response): Promise<ApiSuccess<HealthReport>> {
    const report = await this.health.check();

    response.status(report.status === 'ok' ? 200 : 503);

    return { data: report };
  }
}
