import { describe, expect, it } from 'vitest';

import { atLeast, comparePrecedence, outranks, precedenceOf } from '../../src/plans/composition/precedence';

describe('plan precedence', () => {
  it('a_later_lesson_outranks_an_earlier_one_regardless_of_origin', () => {
    const earlier = precedenceOf(new Date('2026-09-20T10:00:00Z'), 'lesson');
    const later = precedenceOf(new Date('2026-09-21T10:00:00Z'), 'recording_failed');
    expect(outranks(later, earlier)).toBe(true);
    expect(outranks(earlier, later)).toBe(false);
  });

  it('for_the_same_lesson_time_a_lesson_origin_outranks_a_fallback_or_interim', () => {
    const time = new Date('2026-09-20T10:00:00Z');
    const lesson = precedenceOf(time, 'lesson');
    const fallback = precedenceOf(time, 'recording_failed');
    const interim = precedenceOf(time, 'analysis_blocked');
    expect(outranks(lesson, fallback)).toBe(true);
    expect(outranks(lesson, interim)).toBe(true);
    expect(outranks(fallback, lesson)).toBe(false);
  });

  it('fallback_and_interim_are_equal_rank_at_the_same_time', () => {
    const time = new Date('2026-09-20T10:00:00Z');
    const fallback = precedenceOf(time, 'recording_failed');
    const interim = precedenceOf(time, 'analysis_blocked');
    expect(comparePrecedence(fallback, interim)).toBe(0);
  });

  it('at_least_is_true_for_equal_precedence', () => {
    const time = new Date('2026-09-20T10:00:00Z');
    const a = precedenceOf(time, 'lesson');
    const b = precedenceOf(time, 'lesson');
    expect(atLeast(a, b)).toBe(true);
    expect(outranks(a, b)).toBe(false);
  });
});
