import type { ReactNode } from "react";

export function VideoGrid({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="video-grid"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
    >
      {children}
    </div>
  );
}
