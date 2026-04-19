import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LogoutButton } from "@/app/_components/LogoutButton";
import { StatusBadge } from "@/app/_components/library/StatusBadge";
import { findVideoForUser } from "@/app/_lib/videos/repository";
import { toVideoListItemDTO } from "@/app/_lib/videos/library";
import { getSession } from "@/app/_lib/session";

export const dynamic = "force-dynamic";

const PROCESSING_STATUSES = new Set(["validating", "transcribing", "summarizing"]);

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const row = await findVideoForUser(id, session.user.id);
  if (!row) notFound();

  const dto = toVideoListItemDTO(row);
  const isProcessing = PROCESSING_STATUSES.has(dto.status);
  const isFailed = dto.status === "failed";

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/app"
            className="text-sm font-medium text-foreground hover:text-accent"
          >
            ← Back to library
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{dto.title}</h1>
          <StatusBadge status={dto.status} />
        </div>
        {isProcessing && (
          <p className="text-sm text-muted">
            This video is still processing — current stage:{" "}
            <span className="font-medium text-foreground">{dto.status}</span>.
            Transcription and summary will appear here when processing completes.
          </p>
        )}
        {isFailed && (
          <p className="text-sm text-red-700">
            Processing failed. Use the &quot;Retry&quot; action from the library to
            re-enter the pipeline.
          </p>
        )}
        {!isProcessing && !isFailed && (
          <p className="text-sm text-muted">Playable detail coming in F08.</p>
        )}
      </main>
    </div>
  );
}
