import { describe, expect, it } from 'vitest';

import { pickGenres } from '../../src/generation/planning/genre-picker';

const GENRES = [
  'opinion column',
  'book review',
  'interview excerpt',
  'letter to the editor',
  'popular-science explainer',
  'obituary',
  'product teardown',
  'travel dispatch',
  'conference talk transcript',
  'historical vignette',
];

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('genre picker', () => {
  it('never_picks_a_genre_from_the_last_five_generated_readings', () => {
    const history = ['obituary', 'book review', 'travel dispatch', 'opinion column', 'product teardown', 'interview excerpt'];
    const window = new Set(history.slice(0, 5));
    const rng = seeded(3);

    for (let draw = 0; draw < 1000; draw += 1) {
      const [genre] = pickGenres(1, history, GENRES, rng);
      expect(window.has(genre!)).toBe(false);
    }
  });

  it('never_repeats_a_genre_within_a_run', () => {
    const picked = pickGenres(3, [], GENRES, seeded(11));

    expect(new Set(picked).size).toBe(3);
  });

  it('falls_back_to_the_least_recently_used_genre_when_exhausted', () => {
    // Five in the window leave five; a run of seven readings needs two more.
    const history = ['obituary', 'book review', 'travel dispatch', 'opinion column', 'product teardown'];
    const picked = pickGenres(7, history, GENRES, seeded(5));

    expect(new Set(picked).size).toBe(7);
    // After the five outside the window, the oldest in the window comes first.
    expect(picked.slice(5)).toEqual(['product teardown', 'opinion column']);
  });

  it('every_allowed_genre_is_eventually_drawn', () => {
    const history = GENRES.slice(0, 5);
    const rng = seeded(19);
    const seen = new Set<string>();
    for (let draw = 0; draw < 200; draw += 1) {
      seen.add(pickGenres(1, history, GENRES, rng)[0]!);
    }

    expect([...seen].sort()).toEqual(GENRES.slice(5).sort());
  });
});
