import { redirect } from "next/navigation";
import { LogoutButton } from "@/app/_components/LogoutButton";
import { LibraryClient } from "@/app/_components/library/LibraryClient";
import { UploadDropZone } from "@/app/_components/upload/UploadDropZone";
import { UploadProgressList } from "@/app/_components/upload/UploadProgressList";
import { listVideosForUser } from "@/app/_lib/videos/library";
import { readLibraryPreferences } from "@/app/_lib/videos/libraryRepository";
import { getSession } from "@/app/_lib/session";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const prefs =
    (await readLibraryPreferences(session.user.id)) ?? {
      libraryView: "grid" as const,
      librarySort: "recent" as const,
    };

  const items = await listVideosForUser(session.user.id, prefs.librarySort);

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Library</h1>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <UploadDropZone />
        <UploadProgressList />
        <LibraryClient
          initialItems={items}
          initialView={prefs.libraryView}
          initialSort={prefs.librarySort}
        />
      </main>
    </div>
  );
}
