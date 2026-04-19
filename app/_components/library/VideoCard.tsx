"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { VideoListItemDTO } from "@/app/_lib/videos/library";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { DurationOverlay } from "./DurationOverlay";
import { StatusBadge } from "./StatusBadge";

type Props = {
  item: VideoListItemDTO;
  menuItems: ContextMenuItem[];
  titleSlot?: ReactNode;
};

export function VideoCard({ item, menuItems, titleSlot }: Props) {
  return (
    <article
      data-testid="video-card"
      data-video-id={item.id}
      className="flex flex-col gap-2 rounded-lg border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <Link
        href={`/app/videos/${item.id}`}
        className="relative block aspect-video overflow-hidden rounded-md bg-muted-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <div className="absolute bottom-2 right-2">
          <DurationOverlay durationSeconds={item.durationSeconds} />
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {titleSlot ?? (
            <span
              className="block truncate text-sm font-medium text-foreground"
              title={item.title}
            >
              {item.title}
            </span>
          )}
        </div>
        <ContextMenu items={menuItems} triggerLabel={`Actions for ${item.title}`} />
      </div>
      <div>
        <StatusBadge status={item.status} />
      </div>
    </article>
  );
}
