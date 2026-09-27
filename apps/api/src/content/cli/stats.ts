import { PrismaClient } from '@prisma/client';

import { loadEnv } from '../../config/env';
import { ERROR_TAXONOMY_PATH } from '../../taxonomy/error-taxonomy.constants';
import { loadErrorTaxonomyFile } from '../../taxonomy/error-taxonomy';
import { assertContentSchemaExists } from '../content-schema-guard';
import { collectContentStats, renderContentStats } from '../content-stats';
import { collectGenerationStats, renderGenerationStats } from '../../generation/generation-stats';

/**
 * `pnpm content:stats`: read-only inventory, the PRD's corpus target, usage
 * and taxonomy drift. Tells the curator whether the corpus is ready; nothing
 * here gates the product.
 */
async function main(): Promise<void> {
  const config = loadEnv();
  const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);
  const prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  try {
    await assertContentSchemaExists(prisma, 'content:stats');
    const stats = await collectContentStats(prisma, taxonomy);
    // F14's section: how generated items fare at the difficulty gate, per prompt version.
    const generation = await collectGenerationStats(prisma);
    process.stdout.write(`${[...renderContentStats(stats), ...renderGenerationStats(generation)].join('\n')}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
