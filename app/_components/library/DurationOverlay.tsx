import { formatDuration } from "@/app/_lib/videos/formatting";

export function DurationOverlay({
  durationSeconds,
}: {
  durationSeconds: number | null;
}) {
  return (
    <span
      data-testid="duration-overlay"
      className="rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white"
    >
      {formatDuration(durationSeconds)}
    </span>
  );
}
