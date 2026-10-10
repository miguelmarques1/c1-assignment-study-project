import { describe, expect, it } from 'vitest';
import {
  activityRatingInputSchema,
  activitySkipInputSchema,
  activityViewSchema,
  objectiveSubmissionInputSchema,
} from '@english-quest/shared';

const FINGERPRINT = 'e04b03c731a33739d92208355f3b8cd6549c3bd025cd3ad848a46f29bde582ef'.slice(0, 64);
const ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

describe('activity contracts', () => {
  it('a_submission_requires_the_format_specific_field', () => {
    const base = { questionsFingerprint: FINGERPRINT, timeSpentSeconds: 12 };
    expect(
      objectiveSubmissionInputSchema.safeParse({ ...base, answers: [{ index: 0, format: 'multiple_choice' }] }).success,
    ).toBe(false);
    expect(objectiveSubmissionInputSchema.safeParse({ ...base, answers: [{ index: 1, format: 'fill_blank' }] }).success).toBe(false);
    expect(
      objectiveSubmissionInputSchema.safeParse({
        ...base,
        answers: [
          { index: 0, format: 'multiple_choice', optionIndex: 3 },
          { index: 1, format: 'fill_blank', text: ' had listened ' },
        ],
      }).success,
    ).toBe(true);
    expect(
      objectiveSubmissionInputSchema.safeParse({ ...base, answers: [{ index: 0, format: 'multiple_choice', optionIndex: 4 }] }).success,
    ).toBe(false);
  });

  it('a_rating_accepts_null_with_not_useful', () => {
    expect(activityRatingInputSchema.parse({ rating: null, notUseful: true })).toEqual({ rating: null, notUseful: true });
    expect(activityRatingInputSchema.safeParse({ rating: 'meh', notUseful: false }).success).toBe(false);
  });

  it('a_skip_reason_is_trimmed_and_bounded', () => {
    expect(activitySkipInputSchema.parse({ reason: '  Not relevant to me ' }).reason).toBe('Not relevant to me');
    expect(activitySkipInputSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(activitySkipInputSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false);
  });

  it('the_view_schema_parses_a_full_example', () => {
    const entry = (id: string, position: number, kind: string, state: string) => ({
      id,
      day: 2,
      position,
      kind,
      contentItemId: kind === 'writing' ? null : '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
      title: 'Title',
      estimatedMinutes: 7,
      targetTags: [],
      rationale: 'Because.',
      isReview: false,
      carriedOver: false,
      state,
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      skipReason: null,
      rating: null,
      notUseful: false,
    });
    const view = {
      serverTime: '2026-10-02T07:41:10.000Z',
      activity: {
        id: ID,
        lineage: [ID],
        planId: '4f1c2b3a-5d6e-4f70-8a91-b2c3d4e5f607',
        planStatus: 'active',
        readOnly: false,
        kind: 'reading',
        title: 'The housing debate',
        estimatedMinutes: 7,
        targetTags: [{ tag: 'grammar:conditional-3', label: 'Third conditional' }],
        rationale: 'Chosen because.',
        state: 'in_progress',
        startedAt: '2026-10-02T07:38:02.000Z',
        completedAt: null,
        skippedAt: null,
        skipReason: null,
        rating: null,
        notUseful: false,
        planCompletionPercent: 21,
      },
      session: {
        day: 2,
        position: 1,
        count: 2,
        activities: [entry(ID, 1, 'reading', 'in_progress'), entry('5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', 2, 'writing', 'pending')],
      },
      objective: {
        runnable: true,
        item: {
          type: 'reading',
          title: 'The housing debate',
          topic: 'urban housing',
          cefrLevel: 'C1',
          accent: null,
          durationSeconds: null,
          passage: { kind: 'text', text: 'Had the council listened…' },
          hasAudio: false,
          source: null,
          questionsFingerprint: FINGERPRINT,
          questions: [
            { index: 0, format: 'multiple_choice', prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
            { index: 1, format: 'fill_blank', prompt: 'If ___ x', before: 'If ', after: ' x', blankLength: 15 },
            { index: 2, format: 'multiple_choice', prompt: 'Q?', options: ['a', 'b', 'c', 'd'] },
            { index: 3, format: 'fill_blank', prompt: '___ y', before: '', after: ' y', blankLength: 4 },
            { index: 4, format: 'unscored', prompt: 'Order these.', reason: 'format_unavailable' },
          ],
        },
        attempt: { id: ID, status: 'open', startedAt: '2026-10-02T07:38:02.000Z', submittedAt: null },
        result: null,
      },
    };
    expect(activityViewSchema.safeParse(view).success).toBe(true);
    expect(activityViewSchema.safeParse({ ...view, objective: null }).success).toBe(true);
  });
});
