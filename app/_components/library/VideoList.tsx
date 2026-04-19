import type { ReactNode } from "react";

export function VideoList({ children }: { children: ReactNode }) {
  return (
    <ul data-testid="video-list" className="flex flex-col gap-2">
      {children}
    </ul>
  );
}
