const BACKOFF_SCHEDULE_MS: Record<number, number> = {
  0: 0,
  1: 60_000,
  2: 5 * 60_000,
};

export function computeNextRunAt(attempt: number, now: Date = new Date()): Date | null {
  if (attempt >= 3) return null;
  const delay = BACKOFF_SCHEDULE_MS[attempt] ?? 0;
  return new Date(now.getTime() + delay);
}
