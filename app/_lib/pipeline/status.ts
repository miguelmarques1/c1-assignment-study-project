import { prisma } from "@/app/_lib/db";
import type { Prisma } from "@prisma/client";
import type { StageName, VideoStatus } from "./errors";

const ALLOWED_TRANSITIONS: Record<VideoStatus, VideoStatus[]> = {
  validating: ["transcribing", "failed"],
  transcribing: ["summarizing", "failed"],
  summarizing: ["ready", "failed"],
  ready: [],
  failed: ["validating", "transcribing", "summarizing"],
};

export class StatusTransitionError extends Error {
  readonly from: VideoStatus;
  readonly to: VideoStatus;
  constructor(from: VideoStatus, to: VideoStatus) {
    super(`Illegal status transition: ${from} → ${to}`);
    this.name = "StatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

export type TransitionInput = {
  videoId: string;
  expectedFrom: VideoStatus;
  to: VideoStatus;
  stage: StageName | null;
  attempt: number;
  errorCode?: string | null;
};

export async function transitionStatus(
  input: TransitionInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const { videoId, expectedFrom, to, stage, attempt, errorCode } = input;

  if (!ALLOWED_TRANSITIONS[expectedFrom]?.includes(to)) {
    throw new StatusTransitionError(expectedFrom, to);
  }

  const runner = async (client: Prisma.TransactionClient) => {
    const updated = await client.video.updateMany({
      where: { id: videoId, status: expectedFrom },
      data: { status: to },
    });
    if (updated.count !== 1) {
      const current = await client.video.findUnique({ where: { id: videoId } });
      if (!current) throw new Error(`Video ${videoId} not found`);
      if (current.status !== expectedFrom) {
        throw new StatusTransitionError(current.status as VideoStatus, to);
      }
      throw new Error(`Video ${videoId} update failed`);
    }
    const video = await client.video.findUniqueOrThrow({ where: { id: videoId } });
    await client.videoEvent.create({
      data: {
        videoId,
        userId: video.userId,
        fromStatus: expectedFrom,
        toStatus: to,
        stage,
        attempt,
        errorCode: errorCode ?? null,
      },
    });
  };

  if (tx) {
    await runner(tx);
  } else {
    await prisma.$transaction((trx) => runner(trx));
  }
}
