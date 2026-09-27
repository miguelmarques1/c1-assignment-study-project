import { describe, expect, it } from 'vitest';

import type { StoredAnalysis } from '../../src/analysis/analysis-result.reader';
import { profileSourceInputSchema } from '../../src/profile/profile-ingestion.contract';
import {
  analysisSource,
  lessonOccurredAt,
  pronunciationSource,
  type LessonTiming,
} from '../../src/profile-update/lesson-profile-sources';
import type { StoredPronunciationResultSummary } from '../../src/pronunciation/pronunciation-result.reader';

const USER = '4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8';
const LESSON: LessonTiming = {
  id: '9f1c4d7e-3b2a-4f51-9d0c-7a6b5e4c3d21',
  startedAt: new Date('2026-09-20T18:00:00.000Z'),
  openedAt: new Date('2026-09-20T17:55:00.000Z'),
};

function analysis(): StoredAnalysis {
  return {
    id: '2b7f0c1e-5d4a-4c3b-9a8e-1f2d3c4b5a60',
    competencies: {
      grammar: { score: 68, justification: 'x' },
      vocabulary: { score: 74, justification: 'x' },
      fluency: { score: 71, justification: 'x' },
      interaction: { score: 77, justification: 'x' },
      comprehension: { score: 80, justification: 'x' },
    },
    strengths: ['a', 'b', 'c'],
    errors: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        idx: 0,
        quote: 'if I would have known',
        tag: 'grammar:conditional-3',
        correction: 'if I had known',
        explanation: 'x',
        severity: 'major',
        utteranceId: '22222222-2222-4222-8222-222222222222',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        idx: 1,
        quote: 'make a photo',
        tag: 'vocab:collocation',
        correction: 'take a photo',
        explanation: 'x',
        severity: 'minor',
        utteranceId: null,
      },
    ],
    recurringTags: [],
    scenarioContext: 'none',
    scenarioFit: null,
    pronunciationContext: 'assessed',
    transcriptTokensEstimated: 100,
    transcriptTruncated: false,
    taxonomyVersion: '1',
    topics: ['a', 'b', 'c'],
    promptId: 'lesson-analysis',
    promptVersion: '2',
    model: 'gemini',
    createdAt: new Date(),
  };
}

function pronunciationResult(overrides: Partial<StoredPronunciationResultSummary> = {}): StoredPronunciationResultSummary {
  return {
    id: '7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    status: 'assessed',
    scores: { pronunciation: 72.4, accuracy: 81.2, fluency: 95, prosody: 66.1, completeness: 90 },
    excerptCount: 5,
    assessedCount: 5,
    partialAssessment: false,
    sparseSample: false,
    quotaExhausted: false,
    assessedAudioMs: 40_000,
    worstPhonemes: [],
    worstWords: [],
    phonemeTags: [
      { tag: 'phoneme:/θ/', phoneme: 'θ', occurrences: 7, meanAccuracy: 42, exampleWords: ['think', 'three', 'both', 'thanks', 'month', 'path'] },
      { tag: 'phoneme:/ɹ/', phoneme: 'ɹ', occurrences: 1, meanAccuracy: 55, exampleWords: ['red'] },
    ],
    selectionRuleVersion: '1',
    ...overrides,
  };
}

describe('lesson profile sources', () => {
  it('an_analysis_maps_to_five_measurements_and_one_occurrence_per_error', () => {
    const source = analysisSource(USER, LESSON, analysis());

    expect(profileSourceInputSchema.safeParse(source).success).toBe(true);
    expect(source).toMatchObject({
      kind: 'lesson_analysis',
      sourceKey: LESSON.id,
      lessonId: LESSON.id,
      activityId: null,
      revision: analysis().id,
    });
    expect(source.measurements.map((measurement) => [measurement.competency, measurement.value])).toEqual([
      ['grammar', 68],
      ['vocabulary', 74],
      ['fluency', 71],
      ['interaction', 77],
      ['comprehension', 80],
    ]);
    expect(source.measurements.every((measurement) => measurement.accuracy === null && measurement.prosody === null)).toBe(true);
    expect(source.occurrences).toEqual([
      {
        tag: 'grammar:conditional-3',
        quote: 'if I would have known',
        correction: 'if I had known',
        severity: 'major',
        exampleWords: [],
        instances: 1,
        analysisErrorId: '11111111-1111-4111-8111-111111111111',
        utteranceId: '22222222-2222-4222-8222-222222222222',
      },
      expect.objectContaining({ tag: 'vocab:collocation', severity: 'minor', utteranceId: null }),
    ]);
    expect(source.encounters).toEqual([]);
  });

  it('an_assessed_result_maps_to_pronunciation_and_phoneme_occurrences', () => {
    const source = pronunciationSource(USER, LESSON, pronunciationResult());

    expect(profileSourceInputSchema.safeParse(source).success).toBe(true);
    expect(source).toMatchObject({ kind: 'lesson_pronunciation', sourceKey: LESSON.id, revision: pronunciationResult().id });
    // Azure's fluency and completeness are not profile numbers.
    expect(source.measurements).toEqual([{ competency: 'pronunciation', value: 72.4, accuracy: 81.2, prosody: 66.1 }]);
    expect(source.occurrences).toEqual([
      expect.objectContaining({ tag: 'phoneme:/θ/', instances: 7, exampleWords: ['think', 'three', 'both', 'thanks', 'month'], quote: null }),
      expect.objectContaining({ tag: 'phoneme:/ɹ/', instances: 1, exampleWords: ['red'] }),
    ]);
  });

  it('a_no_sample_result_maps_to_an_empty_source', () => {
    const source = pronunciationSource(
      USER,
      LESSON,
      pronunciationResult({ status: 'no_sample', scores: null, phonemeTags: [], excerptCount: 0, assessedCount: 0 }),
    );

    expect(profileSourceInputSchema.safeParse(source).success).toBe(true);
    expect(source.measurements).toEqual([]);
    expect(source.occurrences).toEqual([]);
    expect(source.revision).toBe(pronunciationResult().id);
  });

  it('measured_at_is_the_lesson_start', () => {
    expect(analysisSource(USER, LESSON, analysis()).occurredAt).toEqual(LESSON.startedAt);
    const neverStarted = { ...LESSON, startedAt: null };
    expect(lessonOccurredAt(neverStarted)).toEqual(LESSON.openedAt);
    expect(pronunciationSource(USER, neverStarted, pronunciationResult()).occurredAt).toEqual(LESSON.openedAt);
  });
});
