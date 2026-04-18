"use client";

import { useSyncExternalStore } from "react";
import { getUploadQueue, type QueueItem } from "@/app/_lib/videos/uploadQueue";

export type UseUploadQueueReturn = {
  items: ReadonlyArray<QueueItem>;
  enqueue: (files: File[]) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
};

export function useUploadQueue(): UseUploadQueueReturn {
  const queue = getUploadQueue();
  const items = useSyncExternalStore(
    (listener) => queue.subscribe(listener),
    () => queue.getSnapshot(),
    () => queue.getSnapshot(),
  );
  return {
    items,
    enqueue: (files) => queue.enqueue(files),
    cancel: (id) => queue.cancel(id),
    retry: (id) => queue.retry(id),
    dismiss: (id) => queue.dismiss(id),
  };
}
