import type { StoredAnalysis } from '../analysis/analysis-result.reader';
import type { ProfileSourceInput } from '../profile/profile-ingestion.contract';
import type { StoredPronunciationResultSummary } from '../pronunciation/pronunciation-result.reader';

/** The lesson facts a source needs: its id, and when it happened. */
export interface LessonTiming {
  id: string;
  startedAt: Date | null;
  openedAt: Date;
}

/** A lesson's measurements and occurrences are placed at its start, or its opening for one that never started. */
export function lessonOccurredAt(lesson: LessonTiming): Date {
  return lesson.startedAt ?? lesson.openedAt;
}

/**
 * F10's result as a profile source: one Pronunciation measurement with
 * Accuracy and Prosody as sub-scores (Azure's fluency and completeness are
 * not profile numbers), and one occurrence per `phoneme:` tag — F10 already
 * aggregated the failing instances within the lesson, so they ride along as
 * `instances` instead of drowning grammar tags in the ranking. A `no_sample`
 * result is still a source (nothing measured), so the reconciliation job
 * never revisits it. Keyed by the lesson; the result row is the revision.
 */
export function pronunciationSource(
  userId: string,
  lesson: LessonTiming,
  result: StoredPronunciationResultSummary,
): ProfileSourceInput {
  const scores = result.status === 'assessed' ? result.scores : null;
  return {
    userId,
    kind: 'lesson_pronunciation',
    sourceKey: lesson.id,
    revision: result.id,
    lessonId: lesson.id,
    activityId: null,
    occurredAt: lessonOccurredAt(lesson),
    label: null,
    measurements: scores
      ? [{ competency: 'pronunciation', value: scores.pronunciation, accuracy: scores.accuracy, prosody: scores.prosody }]
      : [],
    occurrences: scores
      ? result.phonemeTags.map((tag) => ({
          tag: tag.tag,
          quote: null,
          correction: null,
          severity: null,
          exampleWords: tag.exampleWords.slice(0, 5),
          instances: Math.max(1, tag.occurrences),
          analysisErrorId: null,
          utteranceId: null,
        }))
      : [],
    encounters: [],
  };
}

/**
 * F11's analysis as a profile source: its five competency scores, and one
 * occurrence per tagged error with its verbatim quote, correction, severity
 * and the owner's utterance. Keyed by the lesson; the analysis row is the
 * revision, so an upstream re-run replaces what this lesson contributed.
 */
export function analysisSource(userId: string, lesson: LessonTiming, analysis: StoredAnalysis): ProfileSourceInput {
  const { competencies } = analysis;
  return {
    userId,
    kind: 'lesson_analysis',
    sourceKey: lesson.id,
    revision: analysis.id,
    lessonId: lesson.id,
    activityId: null,
    occurredAt: lessonOccurredAt(lesson),
    label: null,
    measurements: (['grammar', 'vocabulary', 'fluency', 'interaction', 'comprehension'] as const).map((competency) => ({
      competency,
      value: competencies[competency].score,
      accuracy: null,
      prosody: null,
    })),
    occurrences: analysis.errors.map((error) => ({
      tag: error.tag,
      quote: error.quote,
      correction: error.correction,
      severity: error.severity,
      exampleWords: [],
      instances: 1,
      analysisErrorId: error.id,
      utteranceId: error.utteranceId,
    })),
    encounters: [],
  };
}
