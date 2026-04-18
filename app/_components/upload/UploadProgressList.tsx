"use client";

import { useUploadQueue } from "./useUploadQueue";
import { UploadProgressCard } from "./UploadProgressCard";

export function UploadProgressList() {
  const { items, cancel, retry, dismiss } = useUploadQueue();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="upload-progress-list">
      {items.map((item) => (
        <UploadProgressCard
          key={item.id}
          item={item}
          onCancel={cancel}
          onRetry={retry}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );
}
