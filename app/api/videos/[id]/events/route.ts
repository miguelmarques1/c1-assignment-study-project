import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import { subscribeToVideoEvents } from "@/app/_lib/pipeline/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 20_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const { id } = await params;

  if (!session) {
    return NextResponse.json(
      { code: "EVENTS_NOT_FOUND", message: "Video not found" },
      { status: 404 },
    );
  }
  const video = await prisma.video.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!video) {
    return NextResponse.json(
      { code: "EVENTS_NOT_FOUND", message: "Video not found" },
      { status: 404 },
    );
  }

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort(), {
    once: true,
  });

  const iterable = await subscribeToVideoEvents({
    videoId: id,
    userId: session.user.id,
    signal: abortController.signal,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let keepaliveTimer: NodeJS.Timeout | null = null;
      const sendKeepalive = () => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // controller may already be closed
        }
      };
      keepaliveTimer = setInterval(sendKeepalive, KEEPALIVE_INTERVAL_MS);

      const close = () => {
        if (keepaliveTimer) clearInterval(keepaliveTimer);
        keepaliveTimer = null;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", close, { once: true });

      try {
        for await (const event of iterable) {
          const line = `event: status\ndata: ${JSON.stringify(event)}\n\n`;
          try {
            controller.enqueue(encoder.encode(line));
          } catch {
            break;
          }
        }
      } catch {
        // swallow iterator errors
      } finally {
        close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
