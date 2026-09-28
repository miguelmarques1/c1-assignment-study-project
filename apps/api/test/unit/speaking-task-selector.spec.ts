import { describe, expect, it } from 'vitest';

import type { OpenResponseEntry, ReadAloudEntry } from '../../src/speaking/corpus/speaking-corpus';
import { selectOpenResponse, selectReadAloud } from '../../src/speaking/selection/task-selector';

const NOW = new Date('2026-01-15T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function readAloud(id: string, drills: Record<string, string[]>): ReadAloudEntry {
  return { id, text: `passage ${id}`, drills };
}

function openResponse(id: string, targets: string[]): OpenResponseEntry {
  return { id, prompt: `prompt ${id}`, hint: null, targets };
}

describe('selectReadAloud', () => {
  it('prefers_the_passage_drilling_most_target_phonemes', () => {
    const entries = [
      readAloud('one-hit', { 'phoneme:/θ/': ['think', 'three'] }),
      readAloud('two-hits', { 'phoneme:/θ/': ['think', 'three'], 'phoneme:/ð/': ['this', 'that'] }),
    ];

    const selection = selectReadAloud(entries, {
      targetTags: ['phoneme:/θ/', 'phoneme:/ð/'],
      unmasteredPhonemes: [],
      usage: new Map(),
      now: NOW,
    });

    expect(selection.entryId).toBe('two-hits');
    expect(selection.focusTags).toEqual(['phoneme:/θ/', 'phoneme:/ð/']);
  });

  it('breaks_ties_with_the_owners_other_unmastered_phonemes', () => {
    const entries = [
      readAloud('no-extra', { 'phoneme:/θ/': ['think', 'three'] }),
      readAloud('with-extra', { 'phoneme:/θ/': ['think', 'three'], 'phoneme:/s/': ['sun', 'miss'] }),
    ];

    const selection = selectReadAloud(entries, {
      targetTags: ['phoneme:/θ/'],
      unmasteredPhonemes: ['phoneme:/s/'],
      usage: new Map(),
      now: NOW,
    });

    expect(selection.entryId).toBe('with-extra');
  });

  it('prefers_a_passage_unused_in_fourteen_days', () => {
    const entries = [readAloud('recent', {}), readAloud('stale', {})];
    const usage = new Map([
      ['recent', new Date(NOW.getTime() - 2 * DAY_MS)],
      ['stale', new Date(NOW.getTime() - 20 * DAY_MS)],
    ]);

    const selection = selectReadAloud(entries, { targetTags: [], unmasteredPhonemes: [], usage, now: NOW });

    expect(selection.entryId).toBe('stale');
  });

  it('falls_back_to_least_recently_used', () => {
    const entries = [readAloud('used-recently', {}), readAloud('used-long-ago', {}), readAloud('never-used', {})];
    const usage = new Map([
      ['used-recently', new Date(NOW.getTime() - 20 * DAY_MS)],
      ['used-long-ago', new Date(NOW.getTime() - 40 * DAY_MS)],
    ]);
    // Both "used-long-ago" and "never-used" are outside the 14-day window; the never-used one
    // sorts as the earliest possible use, so it still wins over one used 40 days ago.

    const selection = selectReadAloud(entries, { targetTags: [], unmasteredPhonemes: [], usage, now: NOW });

    expect(selection.entryId).toBe('never-used');
  });

  it('general_mode_skips_the_target_key', () => {
    // With no target tags, an entry with more drills must not automatically win.
    const entries = [
      readAloud('many-drills', { 'phoneme:/θ/': ['think'], 'phoneme:/ð/': ['this'], 'phoneme:/s/': ['sun'] }),
      readAloud('few-drills', { 'phoneme:/p/': ['pen'] }),
    ];
    const usage = new Map([['many-drills', NOW]]); // recently used, so it should lose on that key instead

    const selection = selectReadAloud(entries, { targetTags: [], unmasteredPhonemes: [], usage, now: NOW });

    expect(selection.entryId).toBe('few-drills');
  });

  it('focus_tags_are_capped_at_three', () => {
    const entries = [
      readAloud('many-targets', {
        'phoneme:/a/': ['a', 'aa'],
        'phoneme:/b/': ['b', 'bb'],
        'phoneme:/c/': ['c', 'cc'],
        'phoneme:/d/': ['d', 'dd'],
      }),
    ];

    const selection = selectReadAloud(entries, {
      targetTags: ['phoneme:/a/', 'phoneme:/b/', 'phoneme:/c/', 'phoneme:/d/'],
      unmasteredPhonemes: [],
      usage: new Map(),
      now: NOW,
    });

    expect(selection.focusTags).toHaveLength(3);
  });

  it('is_deterministic_for_the_same_input', () => {
    const entries = [readAloud('a', { 'phoneme:/θ/': ['think'] }), readAloud('b', { 'phoneme:/θ/': ['think'] })];
    const input = { targetTags: ['phoneme:/θ/'], unmasteredPhonemes: [], usage: new Map(), now: NOW };

    const first = selectReadAloud(entries, input);
    const second = selectReadAloud(entries, input);

    expect(first).toEqual(second);
    expect(first.entryId).toBe('a'); // corpus order is the final tie-break
  });
});

describe('selectOpenResponse', () => {
  it('open_response_ranks_by_target_intersection', () => {
    const entries = [openResponse('one-target', ['discourse:hedging']), openResponse('two-targets', ['discourse:hedging', 'discourse:politeness'])];

    const selection = selectOpenResponse(entries, {
      targetTags: ['discourse:hedging', 'discourse:politeness'],
      usage: new Map(),
      now: NOW,
    });

    expect(selection.entryId).toBe('two-targets');
    expect(selection.focusTags).toEqual(['discourse:hedging', 'discourse:politeness']);
  });

  it('falls_back_to_recency_when_targets_tie', () => {
    const entries = [openResponse('recent', ['discourse:hedging']), openResponse('stale', ['discourse:hedging'])];
    const usage = new Map([
      ['recent', new Date(NOW.getTime() - DAY_MS)],
      ['stale', new Date(NOW.getTime() - 30 * DAY_MS)],
    ]);

    const selection = selectOpenResponse(entries, { targetTags: ['discourse:hedging'], usage, now: NOW });

    expect(selection.entryId).toBe('stale');
  });
});
