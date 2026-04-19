import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/app/_lib/db";
import { getAdminMetrics } from "../metrics";

async function seedUser(
  email: string,
  overrides: Partial<{ isAdmin: boolean; isSuspended: boolean }> = {},
) {
  return prisma.user.create({
    data: {
      email,
      name: email.split("@")[0]!,
      passwordHash: "x".repeat(60),
      ...overrides,
    },
  });
}

async function seedVideo(userId: string) {
  return prisma.video.create({
    data: {
      userId,
      title: "clip",
      originalFilename: "a.mp4",
      sizeBytes: BigInt(1),
      containerFormat: "mp4",
      storagePath: `${userId}/v/source.mp4`,
    },
  });
}

describe("getAdminMetrics (integration)", () => {
  beforeEach(async () => {
    await prisma.video.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("metrics_returns_zero_for_empty_database", async () => {
    expect(await getAdminMetrics()).toEqual({ totalUsers: 0, totalVideos: 0 });
  });

  it("metrics_counts_all_users_including_suspended", async () => {
    await seedUser("a@example.com");
    await seedUser("b@example.com", { isSuspended: true });
    await seedUser("c@example.com");
    expect((await getAdminMetrics()).totalUsers).toBe(3);
  });

  it("metrics_counts_all_videos_across_users", async () => {
    const u1 = await seedUser("x@example.com");
    const u2 = await seedUser("y@example.com");
    await seedVideo(u1.id);
    await seedVideo(u1.id);
    await seedVideo(u2.id);
    await seedVideo(u2.id);
    await seedVideo(u2.id);
    expect((await getAdminMetrics()).totalVideos).toBe(5);
  });
});
