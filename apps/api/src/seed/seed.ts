import { PrismaClient } from '@prisma/client';

import { PasswordService } from '../auth/password.service';
import { loadEnv } from '../config/env';
import { runSeed, SchemaNotInitializedError } from './seed.service';

/**
 * Standalone entry point for `pnpm db:seed`. Kept out of the Nest application
 * so seeding never requires booting the HTTP server.
 */
async function main(): Promise<void> {
  const config = loadEnv();

  if (config.SEED_USERS.length === 0) {
    console.warn('SEED_USERS is empty — nothing to seed.');
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  const passwords = new PasswordService();

  try {
    const outcomes = await runSeed(config.SEED_USERS, {
      prisma,
      hashPassword: (plain) => passwords.hash(plain),
    });

    for (const outcome of outcomes) {
      console.warn(`${outcome.action === 'created' ? '+' : '~'} ${outcome.email} (${outcome.displayName}) ${outcome.action}`);
    }

    const created = outcomes.filter((o) => o.action === 'created').length;
    console.warn(`\n${created} created, ${outcomes.length - created} updated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof SchemaNotInitializedError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
