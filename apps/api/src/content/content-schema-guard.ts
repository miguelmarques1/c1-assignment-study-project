import type { PrismaClient } from '@prisma/client';

export class ContentSchemaNotInitializedError extends Error {
  override readonly name = 'ContentSchemaNotInitializedError';
  constructor(command: string) {
    super(`Database schema not initialized. Start the API once to run migrations, then re-run ${command}.`);
  }
}

/**
 * Checked up front, as `db:seed` does, so running a content CLI before the
 * migration that creates the bank produces guidance rather than a Prisma
 * stack trace.
 */
export async function assertContentSchemaExists(prisma: PrismaClient, command: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ table: string | null }>>`
    SELECT to_regclass('public.content_item')::text AS "table"
  `;
  if (!rows[0]?.table) {
    throw new ContentSchemaNotInitializedError(command);
  }
}
