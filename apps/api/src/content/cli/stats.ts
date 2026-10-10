import { PrismaClient } from '@prisma/client';

import { loadEnv } from '../../config/env';
import { ERROR_TAXONOMY_PATH } from '../../taxonomy/error-taxonomy.constants';
import { loadErrorTaxonomyFile } from '../../taxonomy/error-taxonomy';
import { assertContentSchemaExists } from '../content-schema-guard';
import { collectActivityStats, collectContentStats, renderActivityStats, renderContentStats } from '../content-stats';
import { collectGenerationStats, GENERATION_STATS_WINDOW_DAYS, renderGenerationStats } from '../../generation/generation-stats';

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
    // F16's sections: difficulty ratings per prompt version, and questions the runner could not correct.
    const since = new Date(Date.now() - GENERATION_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const activities = await collectActivityStats(prisma, since);
    const sections = [
      ...renderContentStats(stats),
      ...renderGenerationStats(generation),
      ...renderActivityStats(activities, GENERATION_STATS_WINDOW_DAYS),
    ];
    process.stdout.write(`${sections.join('\n')}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
