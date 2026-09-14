import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { buildOpenApiDocument } from '../../src/openapi/setup';

const SNAPSHOT = resolve(__dirname, '../../../../docs/api/openapi.json');

/**
 * The committed OpenAPI snapshot has to track the code, or the file people
 * import into Postman quietly describes an API that no longer exists. This is
 * the guard that makes the convention enforceable instead of a habit: change a
 * route without regenerating, and the suite fails.
 *
 * Preview mode builds the route graph from decorator metadata without
 * instantiating providers, so none of this needs a database or Redis.
 */
async function generate() {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

describe('OpenAPI document', () => {
  it('committed_snapshot_is_up_to_date', async () => {
    const generated = await generate();
    const committed = JSON.parse(await readFile(SNAPSHOT, 'utf8'));

    expect(
      generated,
      'docs/api/openapi.json is stale — run `pnpm --filter @english-quest/api openapi:generate`',
    ).toEqual(committed);
  }, 60_000);

  it('targets_openapi_3_1_so_nullable_schemas_survive', async () => {
    const document = await generate();

    // Zod emits JSON Schema 2020-12, which only 3.1 adopts. Under 3.0 the
    // nullable fields become `type: "null"`, which is invalid there.
    expect(document.openapi).toBe('3.1.0');
  }, 60_000);

  it('every_route_is_documented', async () => {
    const document = await generate();

    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item as Record<string, { summary?: string }>).map(([method, op]) => ({
        id: `${method.toUpperCase()} ${path}`,
        summary: op.summary,
      })),
    );

    expect(operations.length).toBeGreaterThan(0);

    const undocumented = operations.filter((op) => !op.summary);
    expect(
      undocumented.map((op) => op.id),
      'every route needs @ApiOperation({ summary })',
    ).toEqual([]);
  }, 60_000);

  it('protected_routes_declare_the_session_cookie', async () => {
    const document = await generate();

    // /auth/login and /health are the only public routes; everything else must
    // advertise that it needs a session, or the generated client omits it.
    const publicOperations = new Set(['post /auth/login', 'get /health']);

    const missingSecurity = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item as Record<string, { security?: unknown[] }>)
        .filter(([method, op]) => !publicOperations.has(`${method} ${path}`) && !op.security?.length)
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );

    expect(missingSecurity, 'every protected route needs @ApiCookieAuth()').toEqual([]);
  }, 60_000);
});
