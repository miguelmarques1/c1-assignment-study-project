/** The PRD's window: no genre repeats within the user's last 5 generated readings. */
export const GENRE_WINDOW_READINGS = 5;

export type Rng = () => number;

/**
 * Draws a genre for each of `count` readings (spec A15): uniformly among the
 * genres that are neither in the user's last `GENRE_WINDOW_READINGS`
 * generated readings nor already drawn in this run. If that leaves nothing,
 * which only a mix of more than five readings can cause, the least recently
 * used genre not yet drawn in this run is taken instead.
 *
 * `history` lists the user's generated readings' genres, most recent first;
 * only its first five form the window, the rest orders the fallback. Pure,
 * with the randomness injected so tests can seed it.
 */
export function pickGenres(count: number, history: readonly string[], genres: readonly string[], rng: Rng): string[] {
  const window = new Set(history.slice(0, GENRE_WINDOW_READINGS));
  const picked: string[] = [];

  const lastUsed = (genre: string): number => {
    const index = history.indexOf(genre);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };

  for (let index = 0; index < count; index += 1) {
    const pool = genres.filter((genre) => !window.has(genre) && !picked.includes(genre));
    if (pool.length > 0) {
      picked.push(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!);
      continue;
    }
    const unpicked = genres.filter((genre) => !picked.includes(genre));
    const fallbackPool = unpicked.length > 0 ? unpicked : [...genres];
    // Least recently used: the largest index in the history, or never used at all.
    const oldest = [...fallbackPool].sort((a, b) => lastUsed(b) - lastUsed(a))[0]!;
    picked.push(oldest);
  }
  return picked;
}
