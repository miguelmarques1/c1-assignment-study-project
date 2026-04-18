import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/app/_lib/session";
import { findVideoForUser } from "@/app/_lib/videos/repository";
import { readThumbnailStream } from "@/app/_lib/videos/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json({ code: "THUMB_NOT_FOUND" }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getSession();
  if (!session) return notFound();

  const video = await findVideoForUser(id, session.user.id);
  if (!video) return notFound();

  if (!video.thumbnailPath) {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/placeholder-thumbnail.jpg`, 307);
  }

  const thumb = await readThumbnailStream(video.thumbnailPath);
  if (!thumb) return notFound();

  return new NextResponse(thumb.stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(thumb.size),
      "Cache-Control": "private, max-age=86400",
    },
  });
}
