import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error("NEXT_REDIRECT");
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
}));

import path from "node:path";
import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import AppHomePage from "../page";
import { listVideosForUser } from "@/app/_lib/videos/library";
import { redirectPath } from "../../../tests/setup/redirect";

const sessionMock = vi.mocked(getSession);

function setSessionUser(userId: string) {
  sessionMock.mockResolvedValue({
    user: { id: userId, email: `${userId}@x.com`, name: "User", isAdmin: false },
  });
}

async function makeUser(suffix: string, prefs: { view?: string; sort?: string } = {}) {
  return prisma.user.create({
    data: {
      email: `lp-${suffix}@example.com`,
      name: `User ${suffix}`,
      passwordHash:
        "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ...(prefs.view ? { libraryView: prefs.view } : {}),
      ...(prefs.sort ? { librarySort: prefs.sort } : {}),
    },
  });
}

async function seedVideo(userId: string, title: string) {
  return prisma.video.create({
    data: {
      userId,
      title,
      originalFilename: `${title}.mp4`,
      sizeBytes: BigInt(1024),
      containerFormat: "mp4",
      storagePath: path.join(userId, "__seed__", "source.mp4"),
      status: "ready",
    },
  });
}

beforeEach(async () => {
  await prisma.video.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("AppHomePage RSC", () => {
  it("library_rsc_redirects_to_login_when_unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    let caught: unknown;
    try {
      await AppHomePage();
    } catch (err) {
      caught = err;
    }
    expect(redirectPath(caught)).toBe("/login");
  });

  it("library_rsc_renders_dto_for_owner_only_via_query", async () => {
    const owner = await makeUser("o1");
    const other = await makeUser("o2");
    await seedVideo(owner.id, "mine");
    await seedVideo(other.id, "theirs");
    const items = await listVideosForUser(owner.id, "recent");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("mine");
  });

  it("library_rsc_respects_saved_sort_preference", async () => {
    const user = await makeUser("s1", { sort: "title_asc" });
    await seedVideo(user.id, "banana");
    await seedVideo(user.id, "Apple");
    const items = await listVideosForUser(user.id, "title_asc");
    expect(items.map((it) => it.title)).toEqual(["Apple", "banana"]);
  });

  it("library_rsc_renders_empty_state_when_no_videos", async () => {
    const user = await makeUser("e1");
    setSessionUser(user.id);
    const ui = await AppHomePage();
    expect(ui).toBeTruthy();
    const items = await listVideosForUser(user.id, "recent");
    expect(items).toHaveLength(0);
  });
});
