import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import { resetJobForRetry } from "@/app/_lib/pipeline/queue";
import {
  STAGE_ENTRY_STATUS,
  type StageName,
  type VideoStatus,
} from "@/app/_lib/pipeline/errors";
import { transitionStatus } from "@/app/_lib/pipeline/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { code: "RETRY_UNAUTHORIZED", message: "Not authenticated" },
      { status: 401 },
    );
  }
  const { id } = await params;

  const video = await prisma.video.findFirst({
    where: { id, userId: session.user.id },
    include: { job: true },
  });
  if (!video) {
    return NextResponse.json(
      { code: "RETRY_NOT_FOUND", message: "Video not found" },
      { status: 404 },
    );
  }
  if (video.status !== "failed") {
    return NextResponse.json(
      { code: "RETRY_INVALID_STATE", message: "Only failed videos can be retried" },
      { status: 409 },
    );
  }

  const stage = (video.job?.stage as StageName | undefined) ?? "validate";
  const entryStatus = STAGE_ENTRY_STATUS[stage] as VideoStatus;

  try {
    if (video.job) {
      await resetJobForRetry(id);
    } else {
      await prisma.videoJob.create({
        data: {
          videoId: id,
          stage,
          attempt: 0,
          scheduledAt: new Date(),
        },
      });
    }
    await transitionStatus({
      videoId: id,
      expectedFrom: "failed",
      to: entryStatus,
      stage,
      attempt: 0,
    });
  } catch (err) {
    return NextResponse.json(
      {
        code: "RETRY_INTERNAL",
        message: `Failed to retry: ${(err as Error).message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      videoId: id,
      status: entryStatus,
      stage,
      attempt: 0,
    },
    { status: 200 },
  );
}
