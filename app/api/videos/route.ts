import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { getSession } from "@/app/_lib/session";
import { ALLOWED_MIME_TYPES, extensionOf, resolveMaxVideoBytes } from "@/app/_lib/videos/constants";
import {
  VideoUploadError,
  uploadErrorMessage,
  uploadErrorToHttpStatus,
  type UploadErrorCode,
} from "@/app/_lib/videos/errors";
import { uploadVideo } from "@/app/_lib/videos/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(code: UploadErrorCode, message?: string) {
  return NextResponse.json(
    { code, message: message ?? uploadErrorMessage(code) },
    { status: uploadErrorToHttpStatus(code) },
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return errorResponse("UPL_UNAUTHORIZED");

  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const sizeRaw = url.searchParams.get("size");

  if (!name || name.trim().length === 0) return errorResponse("UPL_MISSING_NAME");
  const ext = extensionOf(name);
  if (!ext) return errorResponse("UPL_BAD_EXTENSION");

  if (!sizeRaw) return errorResponse("UPL_MISSING_SIZE");
  const size = Number.parseInt(sizeRaw, 10);
  if (!Number.isFinite(size) || size <= 0) return errorResponse("UPL_MISSING_SIZE");
  const maxBytes = resolveMaxVideoBytes();
  if (size > maxBytes) return errorResponse("UPL_TOO_LARGE");

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength)) {
      if (contentLength > maxBytes) return errorResponse("UPL_TOO_LARGE");
      if (contentLength !== size) return errorResponse("UPL_SIZE_MISMATCH");
    }
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    const mainType = contentType.split(";")[0].trim().toLowerCase();
    if (
      mainType !== "application/octet-stream" &&
      !(ALLOWED_MIME_TYPES as readonly string[]).includes(mainType)
    ) {
      return errorResponse("UPL_BAD_MIME");
    }
  }

  const body = request.body;
  if (!body) return errorResponse("UPL_MISSING_SIZE", "Missing request body");

  const nodeStream = Readable.fromWeb(body as unknown as import("stream/web").ReadableStream);

  try {
    const dto = await uploadVideo({
      userId: session.user.id,
      requestStream: nodeStream,
      declaredName: name,
      declaredSize: size,
      declaredMime: contentType ? contentType.split(";")[0].trim().toLowerCase() : null,
    });
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    if (err instanceof VideoUploadError) {
      return errorResponse(err.code, err.message);
    }
    return errorResponse("UPL_DISK_WRITE", (err as Error).message);
  }
}
