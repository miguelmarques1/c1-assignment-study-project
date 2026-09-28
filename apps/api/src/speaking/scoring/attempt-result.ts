import type { PronunciationScores, SpeakingWord } from '@english-quest/shared';

import { normalizeToken } from '../../excerpts/excerpt-tokens';
import { weightedScores } from '../../pronunciation/pronunciation-aggregate';
import { PHONEME_FAILURE_THRESHOLD } from '../../pronunciation/pronunciation.constants';
import { wordBand } from '../../pronunciation/pronunciation-words';
import type { MappedPhoneme, MappedWord } from '../../speech/pronunciation-assessment.response';
import { alignTokens, type DisplayToken } from './token-alignment';

/** One assessed segment's contribution to the attempt, with word offsets still relative to its own clip. */
export interface SegmentResult {
  /** This segment's position in the full recording — shifts its words into recording time. */
  startMs: number;
  /** The segment's own span, the weight in the duration-weighted merge (A7). */
  durationMs: number;
  scores: PronunciationScores;
  words: MappedWord[];
}

/** A word in recording time: `MappedWord` with `offsetMs` resolved to an absolute `startMs`. */
export interface MergedWord {
  word: string;
  accuracy: number;
  errorTypes: string[];
  startMs: number;
  durationMs: number;
  phonemes: MappedPhoneme[];
}

export interface MergedAttempt {
  scores: PronunciationScores;
  words: MergedWord[];
}

/**
 * Merges every segment's assessment into one attempt: word offsets shifted
 * into recording time, and the five scores as F10's duration-weighted mean
 * over the segments (A7). Assumes every segment succeeded — the scorer
 * never calls this for a partial attempt.
 */
export function mergeSegments(segments: readonly SegmentResult[]): MergedAttempt {
  return {
    scores: weightedScores(segments.map((segment) => ({ durationMs: segment.durationMs, scores: segment.scores }))),
    words: segments.flatMap((segment) =>
      segment.words.map((word) => ({
        word: word.word,
        accuracy: word.accuracy,
        errorTypes: word.errorTypes,
        startMs: word.offsetMs + segment.startMs,
        durationMs: word.durationMs,
        phonemes: word.phonemes,
      })),
    ),
  };
}

export interface FailingPhonemeExample {
  word: string;
  startMs: number;
  durationMs: number;
  accuracy: number;
}

export interface FailingPhonemeGroup {
  /** `phoneme:/symbol/`, F12's taxonomy spelling. */
  tag: string;
  instances: number;
  meanAccuracy: number;
  /** Every failing instance, ascending by accuracy — the worst (and the view's example) is first. */
  examples: FailingPhonemeExample[];
}

/**
 * Every phoneme instance below F10's failure threshold, grouped by tag,
 * ranked worst first (A14). Phonemes of an `Omission` word are excluded —
 * nothing was spoken, so there is nothing to blame a phoneme for.
 */
export function failingPhonemes(words: readonly MergedWord[]): FailingPhonemeGroup[] {
  const groups = new Map<string, FailingPhonemeExample[]>();

  for (const word of words) {
    if (word.errorTypes.includes('Omission')) {
      continue;
    }
    for (const phoneme of word.phonemes) {
      if (phoneme.accuracy >= PHONEME_FAILURE_THRESHOLD) {
        continue;
      }
      const tag = `phoneme:/${phoneme.phoneme}/`;
      const instances = groups.get(tag) ?? [];
      instances.push({ word: word.word, startMs: word.startMs, durationMs: word.durationMs, accuracy: phoneme.accuracy });
      groups.set(tag, instances);
    }
  }

  return [...groups.entries()]
    .map(([tag, instances]) => ({
      tag,
      instances: instances.length,
      meanAccuracy: instances.reduce((sum, instance) => sum + instance.accuracy, 0) / instances.length,
      examples: [...instances].sort((a, b) => a.accuracy - b.accuracy),
    }))
    .sort((a, b) => a.meanAccuracy - b.meanAccuracy || b.instances - a.instances || a.tag.localeCompare(b.tag));
}

/**
 * The reference text (read-aloud) or transcript (open response), tokenized
 * and aligned to the merged assessed words by LCS (A11). A matched token
 * takes the word's band, accuracy, error types and recording offsets; an
 * unmatched one has no band. `Insertion` words are hidden entirely — they
 * are not in the passage, and on an open response they are alignment noise,
 * as F10 treats them. An `Omission` word's accuracy is 0 (F10 never scores
 * one), so it colours `poor` for free; its offsets are nulled since nothing
 * was spoken to play back.
 */
export function displayWords(displayTokens: readonly DisplayToken[], assessedWords: readonly MergedWord[]): SpeakingWord[] {
  const visible = assessedWords.filter((word) => !word.errorTypes.includes('Insertion'));
  const pairs = alignTokens(
    displayTokens.map((token) => token.normalized),
    visible.map((word) => normalizeToken(word.word)),
  );
  const matchOf = new Map(pairs.map((pair) => [pair.aIndex, pair.bIndex]));

  return displayTokens.map((token, index) => {
    const matchedIndex = matchOf.get(index);
    if (matchedIndex === undefined) {
      return { text: token.text, band: null, accuracy: null, errorTypes: [], startMs: null, durationMs: null };
    }
    const word = visible[matchedIndex]!;
    const isOmission = word.errorTypes.includes('Omission');
    return {
      text: token.text,
      band: wordBand(word.accuracy),
      accuracy: Math.round(word.accuracy),
      errorTypes: word.errorTypes,
      startMs: isOmission ? null : word.startMs,
      durationMs: isOmission ? null : word.durationMs,
    };
  });
}

/**
 * How many words actually counted as recognized speech (against the
 * 10-word floor). When the recording was transcribed first (an open
 * response, or a read-aloud over 29 s), the transcription's own word count
 * is the answer. A read-aloud assessed directly, with no transcription
 * pass, has no such count — recognized speech is every assessed word that
 * is not an `Omission`, the passage words Azure heard at all.
 */
export function recognizedWordCount(sttWordCount: number | null, assessedWords: readonly MergedWord[]): number {
  if (sttWordCount !== null) {
    return sttWordCount;
  }
  return assessedWords.filter((word) => !word.errorTypes.includes('Omission')).length;
}
