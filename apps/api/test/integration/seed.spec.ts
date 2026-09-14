import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';
import type { SeedUser } from '../../src/config/env';
import { runSeed, SchemaNotInitializedError } from '../../src/seed/seed.service';
import { applyMigrations } from './helpers/test-app';

let postgres: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let databaseUrl: string;

const passwords = new PasswordService();
const deps = () => ({ prisma, hashPassword: (plain: string) => passwords.hash(plain) });

const users: SeedUser[] = [
  { email: 'one@example.com', displayName: 'One', password: 'a good password' },
  { email: 'two@example.com', displayName: 'Two', password: 'another password' },
];

beforeAll(async () => {
  postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
  databaseUrl = `${postgres.getConnectionUri()}?schema=public`;
  await applyMigrations(databaseUrl);
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  await postgres?.stop().catch(() => undefined);
});

beforeEach(async () => {
  await prisma.user.deleteMany();
});

describe('db:seed', () => {
  it('creates_users_from_configuration', async () => {
    const outcomes = await runSeed(users, deps());

    expect(outcomes.every((outcome) => outcome.action === 'created')).toBe(true);
    expect(await prisma.user.count()).toBe(2);

    const stored = await prisma.user.findMany({ orderBy: { email: 'asc' } });
    expect(stored.map((user) => user.email)).toEqual(['one@example.com', 'two@example.com']);
  });

  it('second_run_updates_without_duplicating', async () => {
    await runSeed(users, deps());
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'one@example.com' } });

    const renamed: SeedUser[] = [{ ...users[0]!, displayName: 'One Renamed' }, users[1]!];
    const outcomes = await runSeed(renamed, deps());

    expect(outcomes.every((outcome) => outcome.action === 'updated')).toBe(true);
    expect(await prisma.user.count()).toBe(2);

    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'one@example.com' } });
    expect(after.displayName).toBe('One Renamed');
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it('does_not_touch_unlisted_users', async () => {
    await prisma.user.create({
      data: {
        email: 'outsider@example.com',
        displayName: 'Outsider',
        passwordHash: await passwords.hash('an outsider password'),
      },
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { email: 'outsider@example.com' },
    });

    await runSeed(users, deps());

    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'outsider@example.com' } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.displayName).toBe('Outsider');
    expect(await prisma.user.count()).toBe(3);
  });

  it('stores_passwords_hashed_at_cost_12', async () => {
    await runSeed(users, deps());

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'one@example.com' } });
    expect(stored.passwordHash).toMatch(/^\$2[ab]\$12\$/);
    expect(await passwords.verify('a good password', stored.passwordHash)).toBe(true);
  });

  it('fails_clearly_before_migrations', async () => {
    const empty = await new PostgreSqlContainer('postgres:16-alpine').start();
    const emptyPrisma = new PrismaClient({
      datasources: { db: { url: `${empty.getConnectionUri()}?schema=public` } },
    });

    try {
      await expect(
        runSeed(users, { prisma: emptyPrisma, hashPassword: (p) => passwords.hash(p) }),
      ).rejects.toThrow(SchemaNotInitializedError);
    } finally {
      await emptyPrisma.$disconnect().catch(() => undefined);
      await empty.stop().catch(() => undefined);
    }
  }, 180_000);
});
