import { PrismaClient } from '@prisma/client';

import { loadEnv } from '../../config/env';
import { StorageService } from '../../storage/storage.service';
import { ERROR_TAXONOMY_PATH } from '../../taxonomy/error-taxonomy.constants';
import { loadErrorTaxonomyFile } from '../../taxonomy/error-taxonomy';
import { CONTENT_ROOT } from '../content-constants';
import { runImport } from '../import/content-importer';
import { parseContentFilter, type ContentFilter } from '../import/folder-scanner';

const USAGE = 'Usage: pnpm content:import [--dry-run] [<type>[/<slug>]]';

class UsageError extends Error {
  override readonly name = 'UsageError';
}

function parseArgs(argv: string[]): { dryRun: boolean; filter: ContentFilter | null } {
  let dryRun = false;
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--') {
      continue;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option ${arg}. ${USAGE}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) {
    throw new UsageError(`Only one filter is allowed. ${USAGE}`);
  }
  return { dryRun, filter: positional[0] ? parseContentFilter(positional[0]) : null };
}

/**
 * Standalone entry point for `pnpm content:import`, kept out of the Nest
 * application like `db:seed`: importing must not require booting the HTTP
 * server. Streams one line per item and exits non-zero when anything was
 * skipped or failed.
 */
async function main(): Promise<number> {
  const { dryRun, filter } = parseArgs(process.argv.slice(2));
  const config = loadEnv();
  const taxonomy = loadErrorTaxonomyFile(ERROR_TAXONOMY_PATH);

  const prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  const storage = new StorageService();
  try {
    const report = await runImport({
      root: CONTENT_ROOT,
      filter,
      dryRun,
      prisma,
      storage,
      taxonomy,
      onLine: (line) => process.stdout.write(`${line}\n`),
    });
    return report.exitCode;
  } finally {
    storage.destroy();
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
