import type { ExcerptRules } from './excerpt-rules';
import { tokenize } from './excerpt-tokens';
import type { PronunciationFocus } from '../profile/pronunciation-focus.port';

/** One stored utterance, as the selection reads it (F08's shape, file offsets). */
export interface SelectableUtterance {
  id: string;
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
  words: readonly { text: string; confidence: number | null }[];
}

export interface SelectedExcerpt {
  utteranceId: string;
  /** 1-based order of acceptance. */
  rank: number;
  startMs: number;
  endMs: number;
  referenceText: string;
  /** The confidence it was ranked on. */
  confidence: number | null;
  wordCount: number;
  fillerShare: number;
  focusWordCount: number;
  durationMs: number;
  reason: string;
}

export interface ExcerptSelection {
  utteranceCount: number;
  eligibleCount: number;
  selected: SelectedExcerpt[];
  selectedAudioMs: number;
  sparse: boolean;
}

interface Candidate {
  utterance: SelectableUtterance;
  durationMs: number;
  wordCount: number;
  fillerShare: number;
  focusWordCount: number;
  /**
   * `word` when every word carries its own confidence, `utterance` when only
   * the utterance does, `none` when neither does. Fast transcription always
   * gives `utterance` (F08), so the word-level rule waits for a provider
   * that reports it.
   */
  confidenceMode: 'word' | 'utterance' | 'none';
  confidence: number | null;
  lowConfidenceWordShare: number;
}

function measure(utterance: SelectableUtterance, rules: ExcerptRules, focus: PronunciationFocus): Candidate {
  const tokens = tokenize(utterance.words, utterance.text);
  const fillers = new Set(rules.fillers);
  const wordCount = tokens.length;
  const fillerCount = tokens.filter((token) => fillers.has(token)).length;

  const wordConfidences = utterance.words.map((word) => word.confidence);
  const everyWordMeasured = wordConfidences.length > 0 && wordConfidences.every((value) => value !== null);

  let confidenceMode: Candidate['confidenceMode'];
  let confidence: number | null;
  let lowConfidenceWordShare = 0;
  if (everyWordMeasured) {
    const values = wordConfidences as number[];
    confidenceMode = 'word';
    confidence = values.reduce((sum, value) => sum + value, 0) / values.length;
    lowConfidenceWordShare = values.filter((value) => value < rules.eligibility.minConfidence).length / values.length;
  } else if (utterance.confidence !== null) {
    confidenceMode = 'utterance';
    confidence = utterance.confidence;
  } else {
    confidenceMode = 'none';
    confidence = null;
  }

  return {
    utterance,
    durationMs: utterance.endMs - utterance.startMs,
    wordCount,
    fillerShare: wordCount === 0 ? 0 : fillerCount / wordCount,
    focusWordCount: tokens.filter((token) => focus.matchesWord(token)).length,
    confidenceMode,
    confidence,
    lowConfidenceWordShare,
  };
}

function isEligible(candidate: Candidate, rules: ExcerptRules): boolean {
  const e = rules.eligibility;
  if (candidate.durationMs < e.minDurationMs || candidate.durationMs > e.maxDurationMs) {
    return false;
  }
  if (candidate.wordCount < e.minWords || candidate.fillerShare > e.maxFillerShare) {
    return false;
  }
  switch (candidate.confidenceMode) {
    case 'word':
      return candidate.lowConfidenceWordShare <= e.maxLowConfidenceWordShare;
    case 'utterance':
      return (candidate.confidence ?? 0) >= e.minConfidence;
    case 'none':
      // No evidence of unusable audio; it ranks after every measured value instead.
      return true;
  }
}

/**
 * Lowest confidence first (unknown last), then most focus words, then
 * longest, then transcript order. The last key makes the order total, so
 * the input's order never matters.
 */
function byRank(a: Candidate, b: Candidate): number {
  if (a.confidence !== b.confidence) {
    if (a.confidence === null) return 1;
    if (b.confidence === null) return -1;
    return a.confidence - b.confidence;
  }
  return (
    b.focusWordCount - a.focusWordCount ||
    b.durationMs - a.durationMs ||
    a.utterance.idx - b.utterance.idx ||
    a.utterance.id.localeCompare(b.utterance.id)
  );
}

/**
 * Whether one more excerpt starting at `start` keeps every window of
 * `windowMs` at `maxPerWindow` starts or fewer. Only a window containing
 * `start` can newly overflow, and every start in such a window lies within
 * `windowMs` of it — so it is enough to look at those, sorted, for
 * `maxPerWindow + 1` consecutive starts spanning less than the window.
 */
function fitsSpacing(accepted: readonly number[], start: number, windowMs: number, maxPerWindow: number): boolean {
  const near = accepted.filter((other) => Math.abs(other - start) < windowMs);
  near.push(start);
  near.sort((a, b) => a - b);
  for (let i = 0; i + maxPerWindow < near.length; i++) {
    if (near[i + maxPerWindow]! - near[i]! < windowMs) {
      return false;
    }
  }
  return true;
}

/** The badge sentence. Neutral on purpose: confidence is relative, so the lowest of a stretch may still be 0.93. */
export function excerptReason(metrics: {
  confidence: number | null;
  wordCount: number;
  durationMs: number;
  focusWordCount: number;
}): string {
  const parts =
    metrics.confidence === null
      ? [`Selected: ${metrics.wordCount} words`, `${(metrics.durationMs / 1000).toFixed(1)} seconds`]
      : [`Selected: recognition confidence ${metrics.confidence.toFixed(2)}`, `${metrics.wordCount} words`];
  if (metrics.focusWordCount > 0) {
    const noun = metrics.focusWordCount === 1 ? 'word' : 'words';
    parts.push(`${metrics.focusWordCount} ${noun} with sounds you're practicing`);
  }
  return parts.join(', ');
}

/**
 * F09's selection, deterministic over its inputs: no I/O, no clock, no
 * randomness. Filters, ranks, then accepts greedily in rank order under the
 * cap and the spacing rule. Fewer than `sparseBelow` selected, whether for
 * lack of eligible utterances or because spacing capped a short lesson,
 * flags the sample sparse.
 */
export function selectExcerpts(
  utterances: readonly SelectableUtterance[],
  rules: ExcerptRules,
  focus: PronunciationFocus,
): ExcerptSelection {
  const { maxExcerpts, spacingWindowMs, maxPerWindow, sparseBelow } = rules.selection;

  const ranked = utterances
    .map((utterance) => measure(utterance, rules, focus))
    .filter((candidate) => isEligible(candidate, rules))
    .sort(byRank);

  const accepted: Candidate[] = [];
  const acceptedStarts: number[] = [];
  for (const candidate of ranked) {
    if (accepted.length >= maxExcerpts) {
      break;
    }
    if (!fitsSpacing(acceptedStarts, candidate.utterance.startMs, spacingWindowMs, maxPerWindow)) {
      continue;
    }
    accepted.push(candidate);
    acceptedStarts.push(candidate.utterance.startMs);
  }

  const selected = accepted.map((candidate, index): SelectedExcerpt => {
    const metrics = {
      confidence: candidate.confidence,
      wordCount: candidate.wordCount,
      durationMs: candidate.durationMs,
      focusWordCount: candidate.focusWordCount,
    };
    return {
      utteranceId: candidate.utterance.id,
      rank: index + 1,
      startMs: candidate.utterance.startMs,
      endMs: candidate.utterance.endMs,
      referenceText: candidate.utterance.text,
      fillerShare: candidate.fillerShare,
      ...metrics,
      reason: excerptReason(metrics),
    };
  });

  return {
    utteranceCount: utterances.length,
    eligibleCount: ranked.length,
    selected,
    selectedAudioMs: selected.reduce((sum, excerpt) => sum + excerpt.durationMs, 0),
    sparse: selected.length < sparseBelow,
  };
}
