import type { ObjectiveAnswer } from '@english-quest/shared';
import { describe, expect, it } from 'vitest';

import type { ObjectiveKind } from '../../src/activities/activity.constants';
import { grade } from '../../src/activities/objective/grading';
import { buildActivityOutcome, competenciesFor } from '../../src/activities/objective/objective-outcome';
import { checkAll } from '../../src/activities/objective/question-check';
import { activityOutcomeSchema, activitySource } from '../../src/profile/profile-ingestion.contract';
import { orderingQuestion, validQuestions } from './objective-test-data';

const ATTEMPT = '6f1c2b3a-5d6e-4f70-8a91-b2c3d4e5f607';
const mc = (index: number, optionIndex: number): ObjectiveAnswer => ({ index, format: 'multiple_choice', optionIndex });
const fill = (index: number, text: string): ObjectiveAnswer => ({ index, format: 'fill_blank', text });

const FAMILIES: Record<string, string> = {
  'grammar:conditional-3': 'grammar',
  'grammar:articles': 'grammar',
  'discourse:linkers': 'discourse',
  'vocab:collocation': 'vocab',
  'phoneme:/θ/': 'phoneme',
};
const familyOf = (tag: string) => FAMILIES[tag] ?? null;

function outcomeFor(answers: ObjectiveAnswer[], options: { kind?: ObjectiveKind; tags?: string[]; questions?: unknown[] } = {}) {
  const checks = checkAll(options.questions ?? validQuestions());
  const graded = grade(checks, answers);
  return buildActivityOutcome({
    userId: '1f1c2b3a-5d6e-4f70-8a91-b2c3d4e5f600',
    activityId: '2f1c2b3a-5d6e-4f70-8a91-b2c3d4e5f601',
    attemptId: ATTEMPT,
    kind: options.kind ?? 'grammar',
    targetTags: options.tags ?? ['grammar:conditional-3'],
    checks,
    answers,
    graded,
    occurredAt: new Date('2026-10-02T07:44:44.000Z'),
    familyOf,
  });
}

const allRight = [mc(0, 1), fill(1, 'had listened to'), mc(2, 1), fill(3, 'Had'), mc(4, 1)];

describe('objective outcome', () => {
  it('each_incorrect_answer_writes_one_occurrence_per_target_tag', () => {
    const outcome = outcomeFor([mc(0, 0), fill(1, 'wrong'), mc(2, 1), fill(3, 'Had'), mc(4, 1)], { tags: ['grammar:conditional-3', 'grammar:articles'] });
    expect(outcome.errorOccurrences).toHaveLength(4);
    expect(outcome.errorOccurrences.map((o) => o.tag).sort()).toEqual(['grammar:articles', 'grammar:articles', 'grammar:conditional-3', 'grammar:conditional-3']);
  });

  it('a_fill_blank_occurrence_quotes_the_learners_sentence_with_a_correction', () => {
    const outcome = outcomeFor([mc(0, 1), fill(1, 'would have heard'), mc(2, 1), fill(3, 'Had'), mc(4, 1)]);
    expect(outcome.errorOccurrences).toEqual([
      {
        tag: 'grammar:conditional-3',
        quote: 'If the council would have heard the tenants, the scheme would have survived.',
        correction: 'If the council had listened to the tenants, the scheme would have survived.',
      },
    ]);
  });

  it('a_multiple_choice_occurrence_carries_no_quote', () => {
    const outcome = outcomeFor([mc(0, 0), fill(1, 'had heard'), mc(2, 1), fill(3, 'Had'), mc(4, 1)]);
    expect(outcome.errorOccurrences).toEqual([{ tag: 'grammar:conditional-3' }]);
  });

  it('a_fully_correct_attempt_records_one_encounter_per_target_tag', () => {
    const outcome = outcomeFor(allRight, { tags: ['grammar:conditional-3', 'grammar:articles'] });
    expect(outcome.correctEncounters).toEqual([{ tag: 'grammar:conditional-3' }, { tag: 'grammar:articles' }]);
    expect(outcome.errorOccurrences).toEqual([]);
  });

  it('a_partly_correct_attempt_records_no_encounter', () => {
    const outcome = outcomeFor([mc(0, 0), ...allRight.slice(1)]);
    expect(outcome.correctEncounters).toEqual([]);
  });

  it('unscored_questions_write_nothing', () => {
    const outcome = outcomeFor([mc(0, 1), fill(1, 'had heard'), mc(2, 1), fill(3, 'Had')], { questions: [...validQuestions().slice(0, 4), orderingQuestion()] });
    expect(outcome.errorOccurrences).toEqual([]);
    expect(outcome.correctEncounters).toEqual([{ tag: 'grammar:conditional-3' }]);
    expect(outcome.measurements).toEqual([{ competency: 'grammar', value: 100 }]);
  });

  it('the_kind_decides_the_measured_competency', () => {
    const tags = ['grammar:conditional-3'];
    expect(competenciesFor('grammar', tags, familyOf)).toEqual(['grammar']);
    expect(competenciesFor('vocabulary', tags, familyOf)).toEqual(['vocabulary']);
    expect(competenciesFor('listening', tags, familyOf)).toEqual(['comprehension']);
    expect(competenciesFor('reading', tags, familyOf)).toEqual(['comprehension']);
  });

  it('error_review_measures_each_family_once_and_never_pronunciation', () => {
    const tags = ['grammar:conditional-3', 'grammar:articles', 'discourse:linkers', 'phoneme:/θ/', 'vocab:collocation'];
    expect(competenciesFor('error_review', tags, familyOf)).toEqual(['grammar', 'interaction', 'vocabulary']);
    expect(competenciesFor('error_review', ['phoneme:/θ/', 'unknown:tag'], familyOf)).toEqual([]);
  });

  it('the_measurement_is_the_rounded_percentage', () => {
    const outcome = outcomeFor([mc(0, 1), fill(1, 'had heard'), mc(2, 1), fill(3, 'nope'), mc(4, 1)]);
    expect(outcome.measurements).toEqual([{ competency: 'grammar', value: 80 }]);
    const threeOfFour = outcomeFor([mc(0, 1), fill(1, 'had heard'), mc(2, 0), fill(3, 'Had')], { questions: [...validQuestions().slice(0, 4), orderingQuestion()] });
    expect(threeOfFour.measurements).toEqual([{ competency: 'grammar', value: 75 }]);
  });

  it('the_attempt_id_is_the_source_key', () => {
    const outcome = outcomeFor(allRight);
    expect(outcome).toMatchObject({ sourceKey: ATTEMPT, activityType: 'grammar' });
    // The contract F12 enforces accepts what this builds.
    expect(() => activitySource(activityOutcomeSchema.parse(outcome))).not.toThrow();
  });
});
