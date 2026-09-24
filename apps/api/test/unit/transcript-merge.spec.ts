import { describe, expect, it } from 'vitest';

import { mergeTranscript, type StoredUtterance } from '../../src/transcription/transcript-merge';

const LESSON_START = new Date('2026-09-24T14:10:00.000Z');
const ALICE = '3f8b1a20-5c6d-4e7f-8a91-2b3c4d5e6f70';
const BRUNO = 'b21e9a44-7f30-4c18-9e55-1d2c3b4a5e6f';

function utterance(idx: number, startMs: number, endMs: number, text: string): StoredUtterance {
  return {
    id: `00000000-0000-4000-8000-${String(idx).padStart(4, '0')}${text.length.toString().padStart(8, '0')}`,
    idx,
    startMs,
    endMs,
    text,
    confidence: 0.8,
    words: [{ text: text.split(' ')[0]!, startMs, durationMs: 200, confidence: null }],
  };
}

describe('mergeTranscript', () => {
  it('offsets_each_track_by_its_recording_start', () => {
    const merged = mergeTranscript(LESSON_START, ALICE, [
      { userId: ALICE, recordingStartedAt: LESSON_START, utterances: [utterance(0, 1_000, 3_000, 'Hi there')] },
      {
        userId: BRUNO,
        recordingStartedAt: new Date(LESSON_START.getTime() + 40_000),
        utterances: [utterance(0, 1_000, 2_500, 'Hello')],
      },
    ]);

    expect(merged.find((entry) => entry.userId === BRUNO)).toMatchObject({ startMs: 41_000, endMs: 42_500 });
    expect(merged.find((entry) => entry.userId === ALICE)).toMatchObject({ startMs: 1_000, endMs: 3_000 });
  });

  it('orders_by_lesson_time_then_speaker_then_index', () => {
    const merged = mergeTranscript(LESSON_START, ALICE, [
      {
        userId: BRUNO,
        recordingStartedAt: new Date(LESSON_START.getTime() + 2_000),
        utterances: [utterance(0, 0, 1_000, 'B zero'), utterance(1, 6_000, 7_000, 'B one')],
      },
      {
        userId: ALICE,
        recordingStartedAt: LESSON_START,
        utterances: [
          utterance(0, 0, 1_000, 'A zero'),
          utterance(1, 2_000, 3_000, 'A one'),
          utterance(2, 8_000, 9_000, 'A two'),
        ],
      },
    ]);

    // A one and B zero both start at 2,000 ms: ties break on user id, then index.
    expect(merged.map((entry) => entry.text)).toEqual(['A zero', 'A one', 'B zero', 'A two', 'B one']);
  });

  it('projects_detail_only_for_the_caller', () => {
    const tracks = [
      { userId: ALICE, recordingStartedAt: LESSON_START, utterances: [utterance(0, 1_000, 2_000, 'Mine')] },
      {
        userId: BRUNO,
        recordingStartedAt: new Date(LESSON_START.getTime() + 5_000),
        utterances: [utterance(0, 1_000, 2_000, 'Theirs')],
      },
    ];

    const merged = mergeTranscript(LESSON_START, ALICE, tracks);
    const mine = merged.find((entry) => entry.userId === ALICE)!;
    const theirs = merged.find((entry) => entry.userId === BRUNO)!;

    expect(mine.confidence).toBe(0.8);
    expect(mine.words).toEqual([{ text: 'Mine', startMs: 1_000, durationMs: 200, confidence: null }]);
    expect(theirs).not.toHaveProperty('confidence');
    expect(theirs).not.toHaveProperty('words');

    // Word timings shift with their utterance when they are shown.
    const asBruno = mergeTranscript(LESSON_START, BRUNO, tracks).find((entry) => entry.userId === BRUNO)!;
    expect(asBruno.words![0]!.startMs).toBe(6_000);
  });

  it('projects_the_excerpt_only_onto_the_callers_utterances', () => {
    const mineSelected = utterance(0, 1_000, 6_000, 'Mine and selected');
    const mineNot = utterance(1, 7_000, 8_000, 'Mine only');
    const theirs = utterance(0, 1_000, 6_000, 'Theirs');
    const badge = {
      rank: 1,
      reason: 'Selected: recognition confidence 0.80, 3 words',
      confidence: 0.8,
      wordCount: 3,
      durationMs: 5_000,
      focusWordCount: 0,
      ruleVersion: '1',
      pronunciation: { status: 'pending' as const, scores: null },
    };
    // Even a map that (wrongly) names another speaker's utterance never leaks onto it.
    const excerpts = new Map([
      [mineSelected.id, badge],
      [theirs.id, { ...badge, rank: 2 }],
    ]);

    const merged = mergeTranscript(
      LESSON_START,
      ALICE,
      [
        { userId: ALICE, recordingStartedAt: LESSON_START, utterances: [mineSelected, mineNot] },
        { userId: BRUNO, recordingStartedAt: new Date(LESSON_START.getTime() + 60_000), utterances: [theirs] },
      ],
      excerpts,
    );

    expect(merged.find((entry) => entry.text === 'Mine and selected')!.excerpt).toEqual(badge);
    expect(merged.find((entry) => entry.text === 'Mine only')).not.toHaveProperty('excerpt');
    expect(merged.find((entry) => entry.text === 'Theirs')).not.toHaveProperty('excerpt');
  });

  it('leaves_offsets_unshifted_before_the_lesson_has_a_start', () => {
    const merged = mergeTranscript(null, ALICE, [
      { userId: ALICE, recordingStartedAt: LESSON_START, utterances: [utterance(0, 1_000, 2_000, 'Early')] },
    ]);

    expect(merged[0]).toMatchObject({ startMs: 1_000 });
  });
});
