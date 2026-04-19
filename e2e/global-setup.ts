import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const ADMIN_EMAIL = "admin@e2e.local";
export const ADMIN_PASSWORD = "admin12345";
export const ALICE_EMAIL = "alice@e2e.local";
export const ALICE_PASSWORD = "alice12345";
export const BOB_EMAIL = "bob-suspended@e2e.local";
export const BOB_PASSWORD = "bob12345";

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set before running e2e tests");
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
    cwd: path.resolve(__dirname, ".."),
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [adminHash, aliceHash, bobHash] = await Promise.all([
      hash(ADMIN_PASSWORD),
      hash(ALICE_PASSWORD),
      hash(BOB_PASSWORD),
    ]);

    await prisma.session.deleteMany({
      where: {
        user: { email: { in: [ADMIN_EMAIL, ALICE_EMAIL, BOB_EMAIL] } },
      },
    });
    await prisma.video.deleteMany({
      where: {
        user: { email: { in: [ADMIN_EMAIL, ALICE_EMAIL, BOB_EMAIL] } },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [ADMIN_EMAIL, ALICE_EMAIL, BOB_EMAIL] } },
    });

    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: "Admin E2E",
        passwordHash: adminHash,
        isAdmin: true,
      },
    });
    await prisma.user.create({
      data: {
        email: ALICE_EMAIL,
        name: "Alice E2E",
        passwordHash: aliceHash,
        isAdmin: false,
      },
    });
    await prisma.user.create({
      data: {
        email: BOB_EMAIL,
        name: "Bob Suspended",
        passwordHash: bobHash,
        isAdmin: false,
        isSuspended: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
