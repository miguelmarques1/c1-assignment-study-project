import { describe, expect, it } from 'vitest';

import { estimateMinutes } from '../../src/plans/composition/estimates';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

describe('estimateMinutes', () => {
  it('listening_adds_two_passes_and_the_question_time', () => {
    // 300s * 2 passes / 60 = 10 minutes, + 3 minutes of questions = 13
    expect(estimateMinutes('listening', { durationSeconds: 300, wordCount: null }, rules)).toBe(13);
  });

  it('listening_falls_back_when_duration_is_missing', () => {
    expect(estimateMinutes('listening', { durationSeconds: null, wordCount: null }, rules)).toBe(9);
  });

  it('reading_adds_words_per_minute_and_the_question_time', () => {
    // 540 words / 180 wpm = 3 minutes, + 3 minutes of questions = 6
    expect(estimateMinutes('reading', { durationSeconds: null, wordCount: 540 }, rules)).toBe(6);
  });

  it('reading_falls_back_when_word_count_is_missing', () => {
    expect(estimateMinutes('reading', { durationSeconds: null, wordCount: null }, rules)).toBe(7);
  });

  it('fixed_kinds_use_the_rules_file_value', () => {
    expect(estimateMinutes('vocabulary', { durationSeconds: null, wordCount: null }, rules)).toBe(6);
    expect(estimateMinutes('grammar', { durationSeconds: null, wordCount: null }, rules)).toBe(6);
    expect(estimateMinutes('error_review', { durationSeconds: null, wordCount: null }, rules)).toBe(6);
    expect(estimateMinutes('writing', { durationSeconds: null, wordCount: null }, rules)).toBe(15);
    expect(estimateMinutes('speaking', { durationSeconds: null, wordCount: null }, rules)).toBe(5);
    expect(estimateMinutes('pronunciation', { durationSeconds: null, wordCount: null }, rules)).toBe(4);
  });

  it('rounds_up_to_the_next_minute', () => {
    // 61s * 2 / 60 = 2.033… -> ceil to 3, + 3 = 6
    expect(estimateMinutes('listening', { durationSeconds: 61, wordCount: null }, rules)).toBe(6);
    // 181 words / 180 = 1.005… -> ceil to 2, + 3 = 5
    expect(estimateMinutes('reading', { durationSeconds: null, wordCount: 181 }, rules)).toBe(5);
  });
});
