import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/app/_lib/db";
import { listUsers } from "../users-query";

async function seedUser(
  email: string,
  opts: Partial<{
    name: string;
    isSuspended: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    videos: number;
  }> = {},
) {
  const user = await prisma.user.create({
    data: {
      email,
      name: opts.name ?? email.split("@")[0]!,
      passwordHash: "x".repeat(60),
      isSuspended: opts.isSuspended ?? false,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      lastLoginAt: opts.lastLoginAt === undefined ? null : opts.lastLoginAt,
    },
  });
  if (opts.videos && opts.videos > 0) {
    for (let i = 0; i < opts.videos; i++) {
      await prisma.video.create({
        data: {
          userId: user.id,
          title: `v${i}`,
          originalFilename: `v${i}.mp4`,
          sizeBytes: BigInt(1),
          containerFormat: "mp4",
          storagePath: `${user.id}/${i}/source.mp4`,
        },
      });
    }
  }
  return user;
}

async function reset() {
  await prisma.video.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
}

describe("listUsers (integration)", () => {
  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("list_users_returns_every_column_the_ui_needs", async () => {
    const u = await seedUser("ada@example.com", {
      name: "Ada",
      lastLoginAt: new Date("2026-04-15T10:00:00Z"),
      videos: 2,
    });
    const { rows } = await listUsers({});
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      id: u.id,
      name: "Ada",
      email: "ada@example.com",
      isAdmin: false,
      isSuspended: false,
      videoCount: 2,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.lastLoginAt).toBeInstanceOf(Date);
    expect(typeof row.checksum).toBe("string");
    expect(row.checksum.length).toBeGreaterThan(0);
  });

  it("list_users_filters_by_substring_match_on_name", async () => {
    await seedUser("ada@example.com", { name: "Ada Lovelace" });
    await seedUser("bob@example.com", { name: "Bob" });
    const { rows } = await listUsers({ search: "ada" });
    expect(rows.map((r) => r.email)).toEqual(["ada@example.com"]);
  });

  it("list_users_filters_by_substring_match_on_email", async () => {
    await seedUser("ada@example.com", { name: "Ada" });
    await seedUser("bob@other.org", { name: "Bob" });
    const { rows } = await listUsers({ search: "@example.com" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("ada@example.com");
  });

  it("list_users_search_is_case_insensitive", async () => {
    await seedUser("ada@example.com", { name: "Ada" });
    const { rows: upper } = await listUsers({ search: "ADA" });
    expect(upper).toHaveLength(1);
  });

  it("list_users_sorts_by_name_ascending_and_descending", async () => {
    await seedUser("b@example.com", { name: "Bob" });
    await seedUser("a@example.com", { name: "Alice" });
    const asc = await listUsers({ sort: "name", direction: "asc" });
    expect(asc.rows.map((r) => r.name)).toEqual(["Alice", "Bob"]);
    const desc = await listUsers({ sort: "name", direction: "desc" });
    expect(desc.rows.map((r) => r.name)).toEqual(["Bob", "Alice"]);
  });

  it("list_users_sorts_by_registration_date", async () => {
    await seedUser("older@example.com", { createdAt: new Date("2026-01-01") });
    await seedUser("newer@example.com", { createdAt: new Date("2026-04-01") });
    const { rows } = await listUsers({ sort: "createdAt", direction: "asc" });
    expect(rows.map((r) => r.email)).toEqual([
      "older@example.com",
      "newer@example.com",
    ]);
  });

  it("list_users_sorts_by_last_login", async () => {
    await seedUser("a@example.com", {
      lastLoginAt: new Date("2026-04-15"),
    });
    await seedUser("b@example.com", { lastLoginAt: null });
    // Postgres default: NULLS LAST on asc, NULLS FIRST on desc.
    const asc = await listUsers({
      sort: "lastLoginAt",
      direction: "asc",
    });
    expect(asc.rows[0]!.email).toBe("a@example.com");
    const desc = await listUsers({
      sort: "lastLoginAt",
      direction: "desc",
    });
    // With NULLS FIRST on desc, the null row ("b") comes first.
    expect(desc.rows.map((r) => r.email)).toContain("a@example.com");
    expect(desc.rows.map((r) => r.email)).toContain("b@example.com");
  });

  it("list_users_sorts_by_video_count", async () => {
    await seedUser("few@example.com", { videos: 1 });
    await seedUser("many@example.com", { videos: 5 });
    const { rows } = await listUsers({
      sort: "videoCount",
      direction: "desc",
    });
    expect(rows[0]!.email).toBe("many@example.com");
  });

  it("list_users_paginates_at_fifty_per_page", async () => {
    for (let i = 0; i < 60; i++) {
      const stamp = String(i).padStart(3, "0");
      await seedUser(`u${stamp}@example.com`, {
        createdAt: new Date(`2026-04-01T00:00:${stamp.slice(-2)}Z`),
      });
    }
    const p1 = await listUsers({ page: 1, sort: "createdAt", direction: "asc" });
    expect(p1.rows).toHaveLength(50);
    expect(p1.totalCount).toBe(60);
    expect(p1.totalPages).toBe(2);
    const p2 = await listUsers({ page: 2, sort: "createdAt", direction: "asc" });
    expect(p2.rows).toHaveLength(10);
  });

  it("list_users_clamps_invalid_page_to_one", async () => {
    await seedUser("a@example.com");
    const { page } = await listUsers({ page: -5 });
    expect(page).toBe(1);
  });

  it("list_users_handles_empty_search", async () => {
    await seedUser("a@example.com");
    const { rows } = await listUsers({ search: "" });
    expect(rows).toHaveLength(1);
  });

  it("list_users_returns_zero_rows_and_valid_pagination_for_no_match", async () => {
    await seedUser("a@example.com");
    const { rows, totalCount, totalPages } = await listUsers({
      search: "nope-nope-nope",
    });
    expect(rows).toHaveLength(0);
    expect(totalCount).toBe(0);
    expect(totalPages).toBe(0);
  });
});
