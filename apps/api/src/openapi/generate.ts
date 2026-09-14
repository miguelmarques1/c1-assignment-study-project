import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { buildOpenApiDocument } from './setup';

/**
 * Writes the committed OpenAPI snapshot.
 *
 * Runs in Nest's preview mode, which builds the route graph from decorator
 * metadata without instantiating providers — so generating the document needs
 * no database, no Redis and no running stack, and can be a cheap check in any
 * environment.
 */
const OUTPUT = resolve(__dirname, '../../../../docs/api/openapi.json');

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  const document = buildOpenApiDocument(app);
  await app.close();

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const routes = Object.entries(document.paths).flatMap(([path, item]) =>
    Object.keys(item as Record<string, unknown>).map((method) => `${method.toUpperCase()} ${path}`),
  );

  console.warn(`Wrote ${OUTPUT}`);
  console.warn(`${routes.length} operations: ${routes.join(', ')}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
