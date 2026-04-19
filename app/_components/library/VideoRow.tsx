"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { VideoListItemDTO } from "@/app/_lib/videos/library";
import {
  formatDuration,
  formatFileSize,
  formatUploadDate,
} from "@/app/_lib/videos/formatting";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { StatusBadge } from "./StatusBadge";

type Props = {
  item: VideoListItemDTO;
  menuItems: ContextMenuItem[];
  titleSlot?: ReactNode;
};

export function VideoRow({ item, menuItems, titleSlot }: Props) {
  return (
    <li
      data-testid="video-row"
      data-video-id={item.id}
      className="flex items-center gap-3 rounded-md border border-border bg-white p-2 shadow-sm transition-shadow hover:shadow-md"
    >
      <Link
        href={`/app/videos/${item.id}`}
        className="block h-14 w-24 flex-shrink-0 overflow-hidden rounded bg-muted-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </Link>
      <div className="min-w-0 flex-1">
        {titleSlot ?? (
          <Link
            href={`/app/videos/${item.id}`}
            className="block truncate text-sm font-medium text-foreground hover:text-accent"
            title={item.title}
          >
            {item.title}
          </Link>
        )}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span data-testid="row-duration">{formatDuration(item.durationSeconds)}</span>
          <span data-testid="row-upload-date">{formatUploadDate(item.createdAt)}</span>
          <span data-testid="row-size">{formatFileSize(item.sizeBytes)}</span>
        </p>
      </div>
      <StatusBadge status={item.status} />
      <ContextMenu items={menuItems} triggerLabel={`Actions for ${item.title}`} />
    </li>
  );
}
