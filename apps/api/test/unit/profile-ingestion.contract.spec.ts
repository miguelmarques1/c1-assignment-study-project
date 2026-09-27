import { describe, expect, it } from 'vitest';

import { activityOutcomeSchema, activitySource } from '../../src/profile/profile-ingestion.contract';

/** The spec's example: a grammar item with two wrong answers on one target tag and one right on another. */
function validOutcome() {
  return {
    userId: '4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8',
    activityId: '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f',
    sourceKey: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    activityType: 'grammar',
    occurredAt: '2026-09-25T09:58:41.000Z',
    measurements: [{ competency: 'grammar', value: 60 }],
    errorOccurrences: [
      { tag: 'grammar:conditional-3', quote: 'If she would have called, I would have come.' },
      { tag: 'grammar:conditional-3', quote: 'If we would have left earlier, we would have made it.' },
    ],
    correctEncounters: [{ tag: 'grammar:past-perfect' }],
  };
}

function issuePaths(input: unknown): string[] {
  const parsed = activityOutcomeSchema.safeParse(input);
  expect(parsed.success).toBe(false);
  return parsed.error!.issues.map((issue) => issue.path.join('.'));
}

describe('activity outcome contract', () => {
  it('accepts_a_valid_outcome', () => {
    const outcome = activityOutcomeSchema.parse(validOutcome());

    expect(outcome.revision).toBe(outcome.sourceKey);
    expect(outcome.occurredAt).toEqual(new Date('2026-09-25T09:58:41.000Z'));

    const source = activitySource(outcome);
    expect(source).toMatchObject({ kind: 'activity', lessonId: null, activityId: outcome.activityId, label: 'grammar' });
    expect(source.measurements).toEqual([{ competency: 'grammar', value: 60, accuracy: null, prosody: null }]);
    expect(source.occurrences).toHaveLength(2);
    expect(source.occurrences[0]).toMatchObject({ instances: 1, exampleWords: [], severity: null });
    expect(source.encounters).toEqual([{ tag: 'grammar:past-perfect' }]);

    const withRevision = activityOutcomeSchema.parse({ ...validOutcome(), revision: 'best-attempt-2' });
    expect(withRevision.revision).toBe('best-attempt-2');
  });

  it('rejects_duplicate_competencies_and_out_of_range_values', () => {
    const paths = issuePaths({
      ...validOutcome(),
      measurements: [
        { competency: 'grammar', value: 60 },
        { competency: 'grammar', value: 101 },
        { competency: 'vocabulary', value: -1 },
      ],
    });

    expect(paths).toEqual(expect.arrayContaining(['measurements.1.value', 'measurements.2.value', 'measurements.1']));
  });

  it('rejects_sub_scores_outside_pronunciation', () => {
    expect(issuePaths({ ...validOutcome(), measurements: [{ competency: 'grammar', value: 60, accuracy: 70 }] })).toContain(
      'measurements.0.accuracy',
    );

    const pronunciation = activityOutcomeSchema.parse({
      ...validOutcome(),
      measurements: [{ competency: 'pronunciation', value: 70, accuracy: 80, prosody: null }],
    });
    expect(activitySource(pronunciation).measurements[0]).toEqual({
      competency: 'pronunciation',
      value: 70,
      accuracy: 80,
      prosody: null,
    });
  });

  it('rejects_oversized_lists_and_quotes', () => {
    const tooMany = Array.from({ length: 51 }, () => ({ tag: 'grammar:conditional-3' }));
    expect(issuePaths({ ...validOutcome(), errorOccurrences: tooMany })).toContain('errorOccurrences');

    const longQuote = [{ tag: 'grammar:conditional-3', quote: 'x'.repeat(501) }];
    expect(issuePaths({ ...validOutcome(), errorOccurrences: longQuote })).toContain('errorOccurrences.0.quote');

    const duplicateEncounters = [{ tag: 'grammar:past-perfect' }, { tag: 'grammar:past-perfect' }];
    expect(issuePaths({ ...validOutcome(), correctEncounters: duplicateEncounters })).toContain('correctEncounters.1');
  });

  it('rejects_a_future_occurrence_and_malformed_ids', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(issuePaths({ ...validOutcome(), occurredAt: future })).toContain('occurredAt');
    expect(issuePaths({ ...validOutcome(), userId: 'not-a-uuid' })).toContain('userId');
    expect(issuePaths({ ...validOutcome(), activityType: '' })).toContain('activityType');
  });
});
