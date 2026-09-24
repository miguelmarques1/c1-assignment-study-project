import { Injectable } from '@nestjs/common';
import type { DependencyHealth, HealthReport } from '@english-quest/shared';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

const PROBE_TIMEOUT_MS = 5_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Probes each dependency independently so a single outage is reported as one
   * failing entry rather than collapsing the whole report. Latency is included
   * because "up but slow" is the failure mode that actually bites in practice.
   */
  async check(): Promise<HealthReport> {
    const dependencies = await Promise.all([
      this.probe('postgres', () => this.prisma.ping()),
      this.probe('redis', () => this.redis.ping()),
      this.probe('minio', () => this.storage.ping()),
      this.probe('livekit', () => HealthService.probeLivekit()),
      this.probe('egress', () => HealthService.probeEgress()),
    ]);

    const status = dependencies.every((entry) => entry.status === 'up') ? 'ok' : 'degraded';

    return { status, dependencies };
  }

  private async probe(
    name: DependencyHealth['name'],
    run: () => Promise<unknown>,
  ): Promise<DependencyHealth> {
    const startedAt = process.hrtime.bigint();

    try {
      await Promise.race([
        run(),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error(`Probe timed out after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS),
        ),
      ]);

      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      return { name, status: 'up', latencyMs: Math.round(latencyMs), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name, status: 'down', latencyMs: null, error: message.split('\n')[0] ?? message };
    }
  }

  /**
   * LiveKit has no dedicated health route; a successful HTTP response on the
   * signalling port is enough to prove the process is reachable.
   */
  private static async probeLivekit(): Promise<void> {
    const response = await fetch(env().LIVEKIT_URL, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    // Any answered request proves reachability; LiveKit replies 200 on the root.
    if (response.status >= 500) {
      throw new Error(`LiveKit responded with ${response.status}`);
    }
  }

  /** The egress container's own `health_port` (F07) — a plain HTTP probe, same shape as LiveKit's. */
  private static async probeEgress(): Promise<void> {
    const response = await fetch(env().LIVEKIT_EGRESS_HEALTH_URL, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (response.status >= 500) {
      throw new Error(`Egress responded with ${response.status}`);
    }
  }
}
