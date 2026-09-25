import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { raw } from 'express';

import { AppModule } from './app.module';
import { runMigrations } from './boot/run-migrations';
import { waitForDependencies } from './boot/wait-for-dependencies';
import { verifyCredentialDecryptability } from './boot/verify-credential-decryptability';
import { loadPrompts } from './boot/load-prompts';
import { verifyAnalysisPrompt } from './boot/verify-analysis-prompt';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv } from './config/env';
import { CredentialCryptoService } from './credentials/credential-crypto.service';
import { PrismaService } from './prisma/prisma.service';
import { HealthService } from './health/health.service';
import { setupOpenApi } from './openapi/setup';
import { PromptRegistryService } from './prompts/prompt-registry.service';
import { ErrorTaxonomyService } from './taxonomy/error-taxonomy.service';
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
  // LiveKit sends `Content-Type: application/webhook+json`, which none of
  // Nest's default body parsers match — they skip the request untouched, so
  // this is free to capture the exact bytes the signature was computed over.
  app.use('/classroom/livekit-webhook', raw({ type: 'application/webhook+json' }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  setupOpenApi(app);

  await app.get(StorageService).ensureBucket();

  // Before serving anything: confirm the stored credentials are readable with
  // the configured master key. Starting with unreadable credentials would turn
  // every pipeline into a confusing "missing key" failure.
  const decryptability = await verifyCredentialDecryptability({
    prisma: app.get(PrismaService),
    crypto: app.get(CredentialCryptoService),
    log: (message) => logger.warn(message),
  });
  if (decryptability.checked > 0) {
    logger.log(
      `Credential vault: ${decryptability.checked} stored, ${decryptability.invalidated} unreadable`,
    );
  }

  // Every prompt file is parsed and structurally validated here. Any problem
  // — malformed YAML, an unknown field, a bad response_schema, a filename
  // that doesn't match its id — refuses to start the process, per the PRD:
  // a typo in a prompt file is caught at boot, never mid-pipeline.
  const prompts = await loadPrompts({
    registry: app.get(PromptRegistryService),
    log: (message) => logger.log(message),
  });
  logger.log(`Prompt library: ${prompts.count} prompts loaded`);

  // The lesson-analysis prompt's error taxonomy enum and the versioned
  // taxonomy file must name exactly the same tags — a mismatch here is a
  // curator error caught at boot, not a validation failure mid-lesson.
  verifyAnalysisPrompt({
    registry: app.get(PromptRegistryService),
    taxonomy: app.get(ErrorTaxonomyService),
  });

  // Readiness line: one probe per dependency with its latency, so a slow or
  // missing service is visible at startup rather than at first use.
  const report = await app.get(HealthService).check();
  const summary = report.dependencies
    .map((entry) => `${entry.name}=${entry.status === 'up' ? `${entry.latencyMs}ms` : 'DOWN'}`)
    .join(' ');
  logger.log(`Dependencies: ${summary}`);

  await app.listen(config.API_PORT);
  logger.log(`API listening on http://localhost:${config.API_PORT} (status: ${report.status})`);
  logger.log(`OpenAPI UI on /docs · document on /docs-json`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
