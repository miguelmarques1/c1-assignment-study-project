import type { AnalysisCompetency } from '@english-quest/shared';

import type { AnalysisScorePoint } from '../analysis/analysis-result.reader';
import type { PronunciationScorePoint } from '../pronunciation/pronunciation-result.reader';
import { HEADLINE_MAX_CHANGES, HEADLINE_SENTENCES } from './lessons.constants';

export type HeadlineDimension = AnalysisCompetency | 'pronunciation';

/** The five LLM competencies in the PRD's order, then pronunciation — also the tie-break order (F19, A8). */
export const HEADLINE_DIMENSIONS: readonly HeadlineDimension[] = [
  'grammar',
  'vocabulary',
  'fluency',
  'interaction',
  'comprehension',
  'pronunciation',
];

const LABELS: Record<HeadlineDimension, string> = {
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  fluency: 'Fluency',
  interaction: 'Interaction',
  comprehension: 'Comprehension',
  pronunciation: 'Pronunciation',
};

/** U+2212, the typographic minus the PRD's own example uses. */
const MINUS = '−';

export type LessonDeltas = Record<HeadlineDimension, number | null>;

interface Measurement {
  lessonId: string;
  startedAt: Date;
  value: number;
}

/**
 * For every lesson in `points`, its value minus the latest earlier one's —
 * "earlier" meaning a strictly earlier `startedAt`, exactly as the readers'
 * `previousFor` / `previousAssessedFor` define it for the routes.
 */
function deltasOf(points: Measurement[]): Map<string, number | null> {
  const sorted = [...points].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const deltas = new Map<string, number | null>();
  sorted.forEach((point, index) => {
    let previous: Measurement | undefined;
    for (let j = index - 1; j >= 0; j--) {
      if (sorted[j]!.startedAt.getTime() < point.startedAt.getTime()) {
        previous = sorted[j];
        break;
      }
    }
    deltas.set(point.lessonId, previous ? point.value - previous.value : null);
  });
  return deltas;
}

/**
 * Every lesson's six deltas, each dimension against its own previous
 * measurement (A9): a lesson missing from one timeline has a null delta
 * there, and the lesson after it compares with the one before the gap.
 * Pronunciation is rounded before subtracting, like the route's `overall`.
 */
export function deltasByLesson(
  analysisTimeline: readonly AnalysisScorePoint[],
  pronunciationTimeline: readonly PronunciationScorePoint[],
): Map<string, LessonDeltas> {
  const byDimension = new Map<HeadlineDimension, Map<string, number | null>>();
  for (const dimension of HEADLINE_DIMENSIONS) {
    const points: Measurement[] =
      dimension === 'pronunciation'
        ? pronunciationTimeline.map((point) => ({
            lessonId: point.lessonId,
            startedAt: point.startedAt,
            value: Math.round(point.pronunciation),
          }))
        : analysisTimeline.map((point) => ({
            lessonId: point.lessonId,
            startedAt: point.startedAt,
            value: point.scores[dimension],
          }));
    byDimension.set(dimension, deltasOf(points));
  }

  const lessonIds = new Set([
    ...analysisTimeline.map((point) => point.lessonId),
    ...pronunciationTimeline.map((point) => point.lessonId),
  ]);
  const result = new Map<string, LessonDeltas>();
  for (const lessonId of lessonIds) {
    const deltas = {} as LessonDeltas;
    for (const dimension of HEADLINE_DIMENSIONS) {
      deltas[dimension] = byDimension.get(dimension)!.get(lessonId) ?? null;
    }
    result.set(lessonId, deltas);
  }
  return result;
}

/**
 * The list row's one-line summary (A8): the two largest changes by
 * magnitude, ties broken in the fixed dimension order, e.g.
 * `Grammar +4 · Pronunciation −2`. Built here so web and mobile show
 * exactly the same sentence.
 */
export function headlineText(deltas: LessonDeltas): string {
  const measured = HEADLINE_DIMENSIONS.filter((dimension) => deltas[dimension] !== null);
  if (measured.length === 0) {
    return HEADLINE_SENTENCES.firstResult;
  }
  const changes = measured
    .map((dimension, order) => ({ dimension, delta: deltas[dimension]!, order }))
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.order - b.order)
    .slice(0, HEADLINE_MAX_CHANGES);
  if (changes.length === 0) {
    return HEADLINE_SENTENCES.noChange;
  }
  return changes
    .map(({ dimension, delta }) => `${LABELS[dimension]} ${delta > 0 ? '+' : MINUS}${Math.abs(delta)}`)
    .join(' · ');
}
