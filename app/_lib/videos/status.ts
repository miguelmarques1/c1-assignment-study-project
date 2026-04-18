export const VIDEO_STATUSES = [
  "validating",
  "transcribing",
  "summarizing",
  "ready",
  "failed",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export function isVideoStatus(value: unknown): value is VideoStatus {
  return typeof value === "string" && (VIDEO_STATUSES as readonly string[]).includes(value);
}
