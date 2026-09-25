import { describe, expect, it } from 'vitest';

import {
  fitToBudget,
  renderTranscriptLines,
  type AnalysisTranscriptTurn,
} from '../../src/analysis/analysis-transcript';

const OWNER = 'owner-1';
const OTHER_A = 'other-a';
const OTHER_B = 'other-b';

function turn(userId: string, startMs: number, text: string): AnalysisTranscriptTurn {
  return { userId, startMs, text };
}

describe('renderTranscriptLines', () => {
  it('labels_the_owner_and_others_without_names_or_ids', () => {
    const turns = [
      turn(OTHER_A, 0, 'Good afternoon.'),
      turn(OWNER, 5000, 'Thanks for seeing me.'),
      turn(OTHER_B, 10000, 'I can help with that.'),
      turn(OTHER_A, 15000, 'Let me check the options.'),
    ];

    const lines = renderTranscriptLines(turns, OWNER);

    expect(lines[0]!.text).toContain('OTHER 1: Good afternoon.');
    expect(lines[1]!.text).toContain('YOU: Thanks for seeing me.');
    expect(lines[2]!.text).toContain('OTHER 2: I can help with that.');
    expect(lines[3]!.text).toContain('OTHER 1: Let me check the options.');

    const joined = lines.map((line) => line.text).join(' ');
    expect(joined).not.toContain(OWNER);
    expect(joined).not.toContain(OTHER_A);
    expect(joined).not.toContain(OTHER_B);
  });

  it('timestamps_are_on_the_lesson_clock', () => {
    const lateJoinShiftedMs = 95 * 60 * 1000 + 12_000; // already shifted by mergeTranscript's convention
    const lines = renderTranscriptLines([turn(OWNER, lateJoinShiftedMs, 'Sorry I am late.')], OWNER);

    expect(lines[0]!.text).toContain('[95:12]');
  });

  it('formats_a_single_digit_second_with_a_leading_zero', () => {
    const lines = renderTranscriptLines([turn(OWNER, 65_000, 'hi')], OWNER);
    expect(lines[0]!.text.startsWith('[1:05]')).toBe(true);
  });
});

describe('fitToBudget', () => {
  it('under_budget_keeps_everything', () => {
    const lines = renderTranscriptLines(
      [turn(OTHER_A, 0, 'Hello there.'), turn(OWNER, 1000, 'Hi, good to see you.')],
      OWNER,
    );

    const result = fitToBudget(lines, 1000, 4);

    expect(result.truncated).toBe(false);
    expect(result.truncationNote).toBe('');
    expect(result.othersOmittedBeforeMs).toBeNull();
    expect(result.ownOmittedBeforeMs).toBeNull();
    expect(result.droppedOthers).toBe(0);
    expect(result.droppedOwn).toBe(0);
    const expectedTokens = lines.reduce((sum, line) => sum + Math.ceil(line.text.length / 4), 0);
    expect(result.estimatedTokens).toBe(expectedTokens);
    expect(result.transcript).toBe(lines.map((line) => line.text).join('\n'));
  });

  it('drops_others_oldest_first_before_any_own_turn', () => {
    // Two long OTHER turns, then one YOU turn — a budget that fits only the
    // YOU turn plus the very last OTHER turn should drop the earliest OTHER
    // turn and keep every YOU turn.
    const longOther = 'x'.repeat(400); // 100 tokens at 4 chars/token
    const turns = [
      turn(OTHER_A, 0, longOther),
      turn(OTHER_A, 10_000, longOther),
      turn(OWNER, 20_000, 'a short reply'),
    ];
    const lines = renderTranscriptLines(turns, OWNER);
    // Budget covers the YOU line plus roughly one OTHER line, not both.
    const budget = Math.ceil(lines[2]!.text.length / 4) + Math.ceil(lines[1]!.text.length / 4);

    const result = fitToBudget(lines, budget, 4);

    expect(result.truncated).toBe(true);
    expect(result.droppedOthers).toBe(1);
    expect(result.droppedOwn).toBe(0);
    expect(result.transcript).not.toContain('OTHER 1: ' + longOther + '\n[0:10]');
    expect(result.transcript).toContain('YOU: a short reply');
    // The surviving OTHER turn (at 10s) is kept; the one at 0s was dropped.
    expect(result.othersOmittedBeforeMs).toBe(10_000);
    expect(result.ownOmittedBeforeMs).toBeNull();
  });

  it('drops_own_oldest_only_after_every_other_turn', () => {
    const longLine = 'x'.repeat(400); // 100 tokens
    const turns = [
      turn(OTHER_A, 0, longLine),
      turn(OWNER, 10_000, longLine),
      turn(OWNER, 20_000, 'the most recent thing YOU said'),
    ];
    const lines = renderTranscriptLines(turns, OWNER);
    // Budget only large enough for the very last line.
    const budget = Math.ceil(lines[2]!.text.length / 4);

    const result = fitToBudget(lines, budget, 4);

    expect(result.truncated).toBe(true);
    expect(result.droppedOthers).toBe(1);
    expect(result.droppedOwn).toBe(1);
    expect(result.transcript).toBe(lines[2]!.text);
    expect(result.transcript).not.toContain('OTHER 1');
    // No OTHER turn survives at all (there was only the one, at 0ms), so the
    // cutoff falls back to just past the last (and only) dropped instant.
    expect(result.othersOmittedBeforeMs).toBe(1);
    expect(result.ownOmittedBeforeMs).toBe(20_000);
  });

  it('the_note_says_the_start_is_missing_not_silent', () => {
    const longLine = 'x'.repeat(400);
    const turns = [turn(OTHER_A, 0, longLine), turn(OWNER, 10_000, 'short')];
    const lines = renderTranscriptLines(turns, OWNER);
    const budget = Math.ceil(lines[1]!.text.length / 4);

    const result = fitToBudget(lines, budget, 4);

    expect(result.truncationNote).toContain('missing text that was never said');
    expect(result.truncationNote).toContain('not as a conversational gap');
    expect(result.truncationNote).toContain("the other participants' turns before");
  });

  it('is_deterministic_for_the_same_input', () => {
    const longLine = 'x'.repeat(400);
    const turns = [turn(OTHER_A, 0, longLine), turn(OWNER, 10_000, 'short')];
    const lines = renderTranscriptLines(turns, OWNER);
    const budget = Math.ceil(lines[1]!.text.length / 4);

    const a = fitToBudget(lines, budget, 4);
    const b = fitToBudget(lines, budget, 4);
    expect(a).toEqual(b);
  });
});
