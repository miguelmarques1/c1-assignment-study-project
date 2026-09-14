import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { runMigrations } from './boot/run-migrations';
import { waitForDependencies } from './boot/wait-for-dependencies';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv } from './config/env';
import { HealthService } from './health/health.service';
import { StorageService } from './storage/storage.service';

/**
 * Boot order matters and is deliberate:
 *   validate config → wait for stores → migrate → provision storage → listen.
 * Any failure before `listen` terminates the process. The API never accepts a
 * request it cannot serve.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const config = loadEnv();

  await waitForDependencies({
    databaseUrl: config.DATABASE_URL,
    redisUrl: config.REDIS_URL,
    log: (message) => logger.log(message),
  });

  await runMigrations({
    databaseUrl: config.DATABASE_URL,
    log: (message) => logger.log(message),
  });

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(cookieParser(config.SESSION_SECRET));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  await app.get(StorageService).ensureBucket();

  // Readiness line: one probe per dependency with its latency, so a slow or
  // missing service is visible at startup rather than at first use.
  const report = await app.get(HealthService).check();
  const summary = report.dependencies
    .map((entry) => `${entry.name}=${entry.status === 'up' ? `${entry.latencyMs}ms` : 'DOWN'}`)
    .join(' ');
  logger.log(`Dependencies: ${summary}`);

  await app.listen(config.API_PORT);
  logger.log(`API listening on http://localhost:${config.API_PORT} (status: ${report.status})`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
