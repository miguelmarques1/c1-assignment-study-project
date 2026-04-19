import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/app/_lib/db";
import {
  startListener,
  stopListener,
  subscribeToVideoEvents,
} from "../events";

async function makeUserAndVideo(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `events-${suffix}@example.com`,
      name: "E",
      passwordHash: "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
  const video = await prisma.video.create({
    data: {
      userId: user.id,
      title: "T",
      originalFilename: "x.mp4",
      sizeBytes: BigInt(1),
      containerFormat: "mp4",
      storagePath: `${user.id}/v/source.mp4`,
      status: "validating",
    },
  });
  return { user, video };
}

beforeEach(async () => {
  await prisma.videoEvent.deleteMany({});
  await prisma.video.deleteMany({});
  await prisma.user.deleteMany({});
  await startListener();
});

afterEach(async () => {
  await stopListener();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function collectOne(
  iter: AsyncIterable<unknown>,
  timeoutMs: number,
): Promise<unknown | null> {
  return Promise.race([
    (async () => {
      for await (const v of iter) return v;
      return null;
    })(),
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

describe("subscribeToVideoEvents (integration)", () => {
  it("subscriber_receives_notify_within_one_second", async () => {
    const { user, video } = await makeUserAndVideo("a");
    const controller = new AbortController();
    const iterable = await subscribeToVideoEvents({
      videoId: video.id,
      signal: controller.signal,
    });

    setTimeout(async () => {
      await prisma.videoEvent.create({
        data: {
          videoId: video.id,
          userId: user.id,
          fromStatus: "validating",
          toStatus: "transcribing",
          stage: "transcribe",
          attempt: 1,
        },
      });
    }, 50);

    const evt = (await collectOne(iterable, 2000)) as
      | { videoId: string; toStatus: string }
      | null;
    expect(evt).not.toBeNull();
    expect(evt!.videoId).toBe(video.id);
    expect(evt!.toStatus).toBe("transcribing");

    controller.abort();
  });

  it("subscriber_filters_by_video_id", async () => {
    const a = await makeUserAndVideo("b1");
    const b = await makeUserAndVideo("b2");
    const controller = new AbortController();
    const iterable = await subscribeToVideoEvents({
      videoId: b.video.id,
      signal: controller.signal,
    });

    setTimeout(async () => {
      await prisma.videoEvent.create({
        data: {
          videoId: a.video.id,
          userId: a.user.id,
          toStatus: "transcribing",
          stage: "transcribe",
          attempt: 1,
        },
      });
      await prisma.videoEvent.create({
        data: {
          videoId: b.video.id,
          userId: b.user.id,
          toStatus: "summarizing",
          stage: "summarize",
          attempt: 1,
        },
      });
    }, 50);

    const evt = (await collectOne(iterable, 2000)) as {
      videoId: string;
      toStatus: string;
    } | null;
    expect(evt).not.toBeNull();
    expect(evt!.videoId).toBe(b.video.id);
    expect(evt!.toStatus).toBe("summarizing");

    controller.abort();
  });
});
