import { describe, expect, it } from 'vitest';

import { foldCompetency, roundScore, scoreDelta, type FoldMeasurement } from '../../src/profile/profile-fold';
import { ACTIVITY_MEASUREMENT_WEIGHT, LESSON_MEASUREMENT_WEIGHT } from '../../src/profile/profile.constants';

let sequence = 0;

function measurement(
  value: number,
  day: number,
  options: { weight?: number; accuracy?: number | null; prosody?: number | null; id?: string } = {},
): FoldMeasurement {
  sequence += 1;
  return {
    id: options.id ?? `m-${String(sequence).padStart(4, '0')}`,
    weight: options.weight ?? LESSON_MEASUREMENT_WEIGHT,
    value,
    accuracy: options.accuracy ?? null,
    prosody: options.prosody ?? null,
    measuredAt: new Date(Date.UTC(2026, 8, day, 18)),
    createdAt: new Date(Date.UTC(2026, 8, 25, 0, 0, sequence)),
  };
}

describe('profile fold', () => {
  it('the_first_measurement_seeds_the_score', () => {
    const folded = foldCompetency([measurement(70, 1)])!;

    expect(folded.score).toBe(70);
    expect(folded.previousScore).toBeNull();
    expect(scoreDelta(folded.score, folded.previousScore)).toBeNull();
    expect(folded.measurementCount).toBe(1);
    expect(folded.rows).toEqual([expect.objectContaining({ scoreAfter: 70 })]);
  });

  it('a_lesson_measurement_moves_the_score_at_0_35', () => {
    const folded = foldCompetency([measurement(70, 1), measurement(90, 2)])!;

    expect(folded.score).toBeCloseTo(77, 10);
    expect(folded.score).not.toBe(90);
    expect(folded.previousScore).toBe(70);
  });

  it('an_activity_measurement_moves_the_score_at_0_15', () => {
    const folded = foldCompetency([measurement(70, 1), measurement(90, 2, { weight: ACTIVITY_MEASUREMENT_WEIGHT })])!;

    expect(folded.score).toBeCloseTo(73, 10);
  });

  it('the_fold_follows_measured_at_not_arrival', () => {
    const first = measurement(60, 1, { id: 'a' });
    const second = measurement(80, 5, { id: 'b' });
    const third = measurement(50, 9, { id: 'c' });

    const inOrder = foldCompetency([first, second, third])!;
    // The day-5 lesson arrives last (resumed from a blocked key after the day-9 one finished).
    const late = { ...second, createdAt: new Date(Date.UTC(2026, 8, 30)) };
    const outOfOrder = foldCompetency([first, third, late])!;

    expect(outOfOrder.score).toBeCloseTo(inOrder.score, 10);
    expect(outOfOrder.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(outOfOrder.rows.map((row) => row.scoreAfter)).toEqual(inOrder.rows.map((row) => row.scoreAfter));
    expect(outOfOrder.lastMeasuredAt).toEqual(third.measuredAt);
  });

  it('ties_on_measured_at_break_on_insertion_then_id', () => {
    const same = new Date(Date.UTC(2026, 8, 3, 18));
    const later = { ...measurement(90, 3, { id: 'x' }), measuredAt: same, createdAt: new Date(Date.UTC(2026, 8, 26)) };
    const earlier = { ...measurement(50, 3, { id: 'y' }), measuredAt: same, createdAt: new Date(Date.UTC(2026, 8, 25)) };

    expect(foldCompetency([later, earlier])!.rows.map((row) => row.id)).toEqual(['y', 'x']);
  });

  it('delta_is_the_difference_of_rounded_scores', () => {
    // 70 → 70.7 (rounds to 71) → 71.505 (rounds to 72): the delta is 72 − 71, not 0.805 rounded.
    const folded = foldCompetency([measurement(70, 1), measurement(72, 2), measurement(73, 3)])!;

    expect(roundScore(70.5)).toBe(71);
    expect(roundScore(70.49)).toBe(70);
    expect(scoreDelta(folded.score, folded.previousScore)).toBe(roundScore(folded.score) - roundScore(folded.previousScore!));
    expect(scoreDelta(72.4, 70.6)).toBe(1);
  });

  it('fewer_than_three_measurements_have_no_trend', () => {
    expect(foldCompetency([measurement(70, 1)])!.trend).toBeNull();
    expect(foldCompetency([measurement(70, 1), measurement(95, 2)])!.trend).toBeNull();
    expect(foldCompetency([measurement(70, 1), measurement(95, 2), measurement(95, 3)])!.trend).not.toBeNull();
  });

  it('trend_uses_a_two_point_band_over_the_last_three', () => {
    // Weight 1 makes each score equal its measurement, so Δ = x₃ − x₁ exactly.
    const exact = (values: number[]) =>
      foldCompetency(values.map((value, index) => measurement(value, index + 1, { weight: 1 })))!.trend;

    expect(exact([70, 99, 72])).toBe('up');
    expect(exact([70, 10, 68])).toBe('down');
    expect(exact([70, 50, 71.9])).toBe('flat');
    // Only the last three count: 72 against 70, whatever came before.
    expect(exact([90, 70, 50, 72])).toBe('up');
  });

  it('pronunciation_sub_scores_fold_at_the_same_weight', () => {
    const folded = foldCompetency([
      measurement(70, 1, { accuracy: 80, prosody: 60 }),
      measurement(80, 2, { accuracy: 90, prosody: null }),
      measurement(90, 3, { accuracy: 70, prosody: 80 }),
    ])!;

    const accuracy = 0.65 * (0.65 * 80 + 0.35 * 90) + 0.35 * 70;
    expect(folded.accuracy).toBeCloseTo(accuracy, 10);
    // The null prosody is skipped: 60, then 80 at 0.35.
    expect(folded.prosody).toBeCloseTo(0.65 * 60 + 0.35 * 80, 10);
    expect(folded.prosodyCount).toBe(2);
    // A row without prosody carries the previous smoothed prosody forward.
    expect(folded.rows[1]!.prosodyAfter).toBe(60);
    expect(folded.rows.map((row) => row.accuracyAfter)).toEqual([80, expect.any(Number), expect.any(Number)]);
  });

  it('an_empty_log_folds_to_nothing', () => {
    expect(foldCompetency([])).toBeNull();
  });
});
