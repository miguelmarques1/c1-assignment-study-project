import { normalizeToken } from '../excerpts/excerpt-tokens';
import {
  PHONEME_FAILURE_THRESHOLD,
  PRONUNCIATION_MIN_ASSESSED_SHARE,
  PRONUNCIATION_NOTES,
  PRONUNCIATION_REASONS,
  WORST_PHONEMES_LIMIT,
  WORST_PHONEME_MIN_OCCURRENCES,
  WORST_WORDS_LIMIT,
} from './pronunciation.constants';

export interface AssessedExcerptWord {
  word: string;
  accuracy: number;
  errorTypes: string[];
  phonemes: Array<{ phoneme: string; accuracy: number }>;
}

/** What one settled, successfully assessed excerpt contributes to the lesson's aggregate. */
export interface AssessedExcerptInput {
  excerptId: string;
  utteranceId: string;
  /** The clip's own duration — the weight in every duration-weighted mean. */
  durationMs: number;
  scores: {
    pronunciation: number;
    accuracy: number;
    fluency: number;
    prosody: number | null;
    completeness: number;
  };
  words: AssessedExcerptWord[];
}

export interface AggregateInput {
  /** Excerpts F09 selected — the 60% rule's denominator. */
  excerptCount: number;
  assessedExcerpts: AssessedExcerptInput[];
  /** Copied from F09's selection. */
  sparseSample: boolean;
  /** Whether a 429 abandoned the rest of the excerpts in this run. */
  quotaExhausted: boolean;
}

export interface WorstPhonemeResult {
  phoneme: string;
  meanAccuracy: number;
  occurrences: number;
  exampleWord: string;
  exampleExcerptId: string;
  exampleUtteranceId: string;
}

export interface WorstWordResult {
  word: string;
  meanAccuracy: number;
  occurrences: number;
  errorTypes: string[];
  exampleExcerptId: string;
  exampleUtteranceId: string;
}

export interface PhonemeTagResult {
  tag: string;
  phoneme: string;
  occurrences: number;
  meanAccuracy: number;
  exampleWords: string[];
}

export interface AggregateResult {
  assessedCount: number;
  partialAssessment: boolean;
  scores: {
    pronunciation: number;
    accuracy: number;
    fluency: number;
    prosody: number | null;
    completeness: number;
  };
  assessedAudioMs: number;
  worstPhonemes: WorstPhonemeResult[];
  worstWords: WorstWordResult[];
  phonemeTags: PhonemeTagResult[];
  notes: string[];
}

export type AggregateDecision =
  | { outcome: 'fail'; reason: string }
  | { outcome: 'complete'; result: AggregateResult };

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) {
      group.push(item);
    } else {
      groups.set(k, [item]);
    }
  }
  return groups;
}

/** The lowest-scoring instance in a group — the source of a ranked entry's example. */
function lowestOf<T extends { accuracy: number }>(group: T[]): T {
  return group.reduce((worst, instance) => (instance.accuracy < worst.accuracy ? instance : worst));
}

interface PhonemeInstance {
  phoneme: string;
  accuracy: number;
  word: string;
  excerptId: string;
  utteranceId: string;
}

function collectPhonemeInstances(excerpts: AssessedExcerptInput[]): PhonemeInstance[] {
  return excerpts.flatMap((excerpt) =>
    excerpt.words.flatMap((word) =>
      word.phonemes.map((phoneme) => ({
        phoneme: phoneme.phoneme,
        accuracy: phoneme.accuracy,
        word: word.word,
        excerptId: excerpt.excerptId,
        utteranceId: excerpt.utteranceId,
      })),
    ),
  );
}

/** Every failing IPA phoneme becomes a ledger tag, however few times it occurred. */
function buildPhonemeTags(failing: PhonemeInstance[]): PhonemeTagResult[] {
  const groups = groupBy(failing, (instance) => instance.phoneme);
  return [...groups.entries()]
    .map(([phoneme, group]) => ({
      tag: `phoneme:/${phoneme}/`,
      phoneme,
      occurrences: group.length,
      meanAccuracy: mean(group.map((instance) => instance.accuracy)),
      exampleWords: [...new Set(group.map((instance) => instance.word))].slice(0, 5),
    }))
    .sort((a, b) => a.phoneme.localeCompare(b.phoneme));
}

/** The 5 worst phonemes with at least 2 failing occurrences, ranked ascending by mean accuracy. */
function rankWorstPhonemes(failing: PhonemeInstance[]): WorstPhonemeResult[] {
  const groups = groupBy(failing, (instance) => instance.phoneme);
  return [...groups.entries()]
    .filter(([, group]) => group.length >= WORST_PHONEME_MIN_OCCURRENCES)
    .map(([phoneme, group]) => {
      const worst = lowestOf(group);
      return {
        phoneme,
        meanAccuracy: mean(group.map((instance) => instance.accuracy)),
        occurrences: group.length,
        exampleWord: worst.word,
        exampleExcerptId: worst.excerptId,
        exampleUtteranceId: worst.utteranceId,
      };
    })
    .sort(
      (a, b) =>
        a.meanAccuracy - b.meanAccuracy || b.occurrences - a.occurrences || a.phoneme.localeCompare(b.phoneme),
    )
    .slice(0, WORST_PHONEMES_LIMIT);
}

interface WordInstance {
  word: string;
  normalized: string;
  accuracy: number;
  errorTypes: string[];
  excerptId: string;
  utteranceId: string;
}

/** Every word instance excluding `Omission`/`Insertion` — alignment noise against the learner's own transcript. */
function collectWordInstances(excerpts: AssessedExcerptInput[]): WordInstance[] {
  return excerpts.flatMap((excerpt) =>
    excerpt.words
      .filter((word) => !word.errorTypes.includes('Omission') && !word.errorTypes.includes('Insertion'))
      .map((word) => ({
        word: word.word,
        normalized: normalizeToken(word.word),
        accuracy: word.accuracy,
        errorTypes: word.errorTypes,
        excerptId: excerpt.excerptId,
        utteranceId: excerpt.utteranceId,
      }))
      .filter((word) => word.normalized.length > 0),
  );
}

/** The 10 worst words, grouped by normalized spelling, ranked ascending by mean accuracy. No occurrence floor. */
function rankWorstWords(instances: WordInstance[]): WorstWordResult[] {
  const groups = groupBy(instances, (instance) => instance.normalized);
  return [...groups.entries()]
    .map(([normalized, group]) => {
      const worst = lowestOf(group);
      return {
        word: normalized,
        meanAccuracy: mean(group.map((instance) => instance.accuracy)),
        occurrences: group.length,
        errorTypes: [...new Set(group.flatMap((instance) => instance.errorTypes))],
        exampleExcerptId: worst.excerptId,
        exampleUtteranceId: worst.utteranceId,
      };
    })
    .sort((a, b) => a.meanAccuracy - b.meanAccuracy || b.occurrences - a.occurrences || a.word.localeCompare(b.word))
    .slice(0, WORST_WORDS_LIMIT);
}

function weightedScores(excerpts: AssessedExcerptInput[]): AggregateResult['scores'] {
  const totalMs = excerpts.reduce((sum, excerpt) => sum + excerpt.durationMs, 0);
  const weighted = (pick: (excerpt: AssessedExcerptInput) => number) =>
    excerpts.reduce((sum, excerpt) => sum + pick(excerpt) * excerpt.durationMs, 0) / totalMs;

  const withProsody = excerpts.filter((excerpt) => excerpt.scores.prosody !== null);
  const prosodyMs = withProsody.reduce((sum, excerpt) => sum + excerpt.durationMs, 0);

  return {
    pronunciation: weighted((excerpt) => excerpt.scores.pronunciation),
    accuracy: weighted((excerpt) => excerpt.scores.accuracy),
    fluency: weighted((excerpt) => excerpt.scores.fluency),
    completeness: weighted((excerpt) => excerpt.scores.completeness),
    prosody:
      prosodyMs === 0
        ? null
        : withProsody.reduce((sum, excerpt) => sum + (excerpt.scores.prosody as number) * excerpt.durationMs, 0) /
          prosodyMs,
  };
}

function buildNotes(
  sparseSample: boolean,
  assessedCount: number,
  excerptCount: number,
  partialAssessment: boolean,
  quotaExhausted: boolean,
): string[] {
  const notes: string[] = [];
  if (sparseSample) {
    notes.push(PRONUNCIATION_NOTES.sparse(assessedCount));
  }
  if (partialAssessment) {
    notes.push(PRONUNCIATION_NOTES.partial(assessedCount, excerptCount));
  }
  if (quotaExhausted) {
    notes.push(PRONUNCIATION_NOTES.quota);
  }
  return notes;
}

/**
 * The pure decision at the end of the pronunciation stage: below 60%
 * assessed, the stage fails with a reason naming quota or the count,
 * whichever caused it; at or above 60%, the aggregate is computed. Never
 * called for an empty selection — the handler completes that as `no_sample`
 * before any excerpt is touched. Order-independent in its inputs: every
 * output list is sorted on its own ranking key, never on iteration order.
 */
export function aggregatePronunciation(input: AggregateInput): AggregateDecision {
  const assessedCount = input.assessedExcerpts.length;
  const share = assessedCount / input.excerptCount;

  if (share < PRONUNCIATION_MIN_ASSESSED_SHARE) {
    return {
      outcome: 'fail',
      reason: input.quotaExhausted
        ? PRONUNCIATION_REASONS.quotaExhausted
        : PRONUNCIATION_REASONS.tooFewAssessed(assessedCount, input.excerptCount),
    };
  }

  const partialAssessment = assessedCount < input.excerptCount;
  const phonemeInstances = collectPhonemeInstances(input.assessedExcerpts);
  const failingPhonemes = phonemeInstances.filter((instance) => instance.accuracy < PHONEME_FAILURE_THRESHOLD);
  const wordInstances = collectWordInstances(input.assessedExcerpts);

  return {
    outcome: 'complete',
    result: {
      assessedCount,
      partialAssessment,
      scores: weightedScores(input.assessedExcerpts),
      assessedAudioMs: input.assessedExcerpts.reduce((sum, excerpt) => sum + excerpt.durationMs, 0),
      worstPhonemes: rankWorstPhonemes(failingPhonemes),
      worstWords: rankWorstWords(wordInstances),
      phonemeTags: buildPhonemeTags(failingPhonemes),
      notes: buildNotes(input.sparseSample, assessedCount, input.excerptCount, partialAssessment, input.quotaExhausted),
    },
  };
}
