import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/app/_lib/db";
import { transitionStatus, StatusTransitionError } from "../status";

async function makeUserAndVideo(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `status-${suffix}@example.com`,
      name: "S",
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
  await prisma.videoJob.deleteMany({});
  await prisma.video.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("transitionStatus (integration)", () => {
  it("transition_updates_video_status_and_inserts_event", async () => {
    const { video } = await makeUserAndVideo("a");
    await transitionStatus({
      videoId: video.id,
      expectedFrom: "validating",
      to: "transcribing",
      stage: "transcribe",
      attempt: 1,
    });
    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("transcribing");
    const events = await prisma.videoEvent.findMany({ where: { videoId: video.id } });
    expect(events).toHaveLength(1);
    expect(events[0].fromStatus).toBe("validating");
    expect(events[0].toStatus).toBe("transcribing");
    expect(events[0].stage).toBe("transcribe");
    expect(events[0].attempt).toBe(1);
  });

  it("transition_rejects_illegal_path", async () => {
    const { video } = await makeUserAndVideo("b");
    await expect(
      transitionStatus({
        videoId: video.id,
        expectedFrom: "validating",
        to: "ready",
        stage: null,
        attempt: 0,
      }),
    ).rejects.toBeInstanceOf(StatusTransitionError);
    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("validating");
  });

  it("transition_to_failed_records_error_code", async () => {
    const { video } = await makeUserAndVideo("c");
    await transitionStatus({
      videoId: video.id,
      expectedFrom: "validating",
      to: "failed",
      stage: "validate",
      attempt: 3,
      errorCode: "PIPE_VALIDATE_TOO_LONG",
    });
    const event = await prisma.videoEvent.findFirstOrThrow({
      where: { videoId: video.id },
    });
    expect(event.toStatus).toBe("failed");
    expect(event.errorCode).toBe("PIPE_VALIDATE_TOO_LONG");
  });

  it("transition_is_atomic_when_expected_status_mismatch", async () => {
    const { video } = await makeUserAndVideo("d");
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "ready" },
    });
    await expect(
      transitionStatus({
        videoId: video.id,
        expectedFrom: "validating",
        to: "transcribing",
        stage: "transcribe",
        attempt: 0,
      }),
    ).rejects.toThrow();
    const events = await prisma.videoEvent.findMany({ where: { videoId: video.id } });
    expect(events).toHaveLength(0);
    const after = await prisma.video.findUniqueOrThrow({ where: { id: video.id } });
    expect(after.status).toBe("ready");
  });
});
