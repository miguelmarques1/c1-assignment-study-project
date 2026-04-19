"use client";

import type { VideoListItemDTO } from "@/app/_lib/videos/library";
import type { LibrarySort, LibraryView } from "@/app/_lib/videos/libraryValidation";

type Props = {
  initialItems: VideoListItemDTO[];
  initialView: LibraryView;
  initialSort: LibrarySort;
};

export function LibraryClient({ initialItems }: Props) {
  if (initialItems.length === 0) {
    return (
      <p className="text-sm text-muted">Your videos will appear here.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {initialItems.map((item) => (
        <li key={item.id} className="rounded-md border border-border bg-white p-3 text-sm">
          {item.title}
        </li>
      ))}
    </ul>
  );
}
