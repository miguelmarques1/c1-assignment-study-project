import type { PrismaClient } from '@prisma/client';

import type { SeedUser } from '../config/env';

export class SchemaNotInitializedError extends Error {
  constructor() {
    super(
      'Database schema not initialized. Start the API once to run migrations, then re-run db:seed.',
    );
    this.name = 'SchemaNotInitializedError';
  }
}

export interface SeedOutcome {
  email: string;
  displayName: string;
  action: 'created' | 'updated';
}

export interface SeedDeps {
  prisma: PrismaClient;
  hashPassword: (plain: string) => Promise<string>;
}

/**
 * Creates or updates the configured accounts. Idempotent by email, and
 * deliberately scoped: accounts that are not listed are never touched, so a
 * user added directly to the database survives every future seed run.
 */
export async function runSeed(users: SeedUser[], deps: SeedDeps): Promise<SeedOutcome[]> {
  await assertSchemaExists(deps.prisma);

  const outcomes: SeedOutcome[] = [];

  for (const user of users) {
    const existing = await deps.prisma.user.findUnique({ where: { email: user.email } });
    const passwordHash = await deps.hashPassword(user.password);

    if (existing) {
      await deps.prisma.user.update({
        where: { email: user.email },
        data: { displayName: user.displayName, passwordHash },
      });
      outcomes.push({ email: user.email, displayName: user.displayName, action: 'updated' });
    } else {
      await deps.prisma.user.create({
        data: { email: user.email, displayName: user.displayName, passwordHash },
      });
      outcomes.push({ email: user.email, displayName: user.displayName, action: 'created' });
    }
  }

  return outcomes;
}

/**
 * Checked up front so running the seed before the first migration produces
 * guidance rather than a Prisma stack trace.
 */
export async function assertSchemaExists(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ table: string | null }>>`
    SELECT to_regclass('public.users')::text AS "table"
  `;

  if (!rows[0]?.table) {
    throw new SchemaNotInitializedError();
  }
}
