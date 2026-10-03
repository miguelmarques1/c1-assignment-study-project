import type { PronunciationScores, SpeakingActivityKind } from '@english-quest/shared';

import type { ActivityOutcomeInput } from '../../profile/profile-ingestion.contract';
import type { FailingPhonemeGroup, MergedWord } from './attempt-result';

export interface BestAttemptEvidence {
  id: string;
  scoredAt: Date;
  scores: PronunciationScores;
  /** Every assessed word of the best attempt, for finding which target phonemes it measured at all. */
  words: readonly MergedWord[];
  failingPhonemes: readonly FailingPhonemeGroup[];
}

export interface SpeakingOutcomeInput {
  userId: string;
  /** The lineage root — the stable identity across a carried activity's whole history (A9). */
  rootActivityId: string;
  kind: SpeakingActivityKind;
  targetTags: readonly string[];
  bestAttempt: BestAttemptEvidence;
}

/** Every `phoneme:` tag the attempt actually measured — spoken and assessed, not omitted. */
function measuredPhonemeTags(words: readonly MergedWord[]): Set<string> {
  const tags = new Set<string>();
  for (const word of words) {
    if (word.errorTypes.includes('Omission')) {
      continue;
    }
    for (const phoneme of word.phonemes) {
      tags.add(`phoneme:/${phoneme.phoneme}/`);
    }
  }
  return tags;
}

/**
 * The best scored attempt as F12's activity outcome (A14): one
 * `pronunciation` measurement with its sub-scores, one error occurrence per
 * failing phoneme, and one correct encounter per target phoneme the attempt
 * measured without a failing instance. An open response sends no
 * encounters — its targets are analysis-family tags this feature cannot
 * judge, not phonemes. Keyed on the lineage root, so a better attempt
 * always replaces the one before it (A16).
 */
export function buildSpeakingOutcome(input: SpeakingOutcomeInput): ActivityOutcomeInput {
  const failingTags = new Set(input.bestAttempt.failingPhonemes.map((group) => group.tag));

  const correctEncounters =
    input.kind === 'pronunciation'
      ? (() => {
          const measured = measuredPhonemeTags(input.bestAttempt.words);
          return input.targetTags
            .filter((tag) => tag.startsWith('phoneme:') && measured.has(tag) && !failingTags.has(tag))
            .map((tag) => ({ tag }));
        })()
      : [];

  return {
    userId: input.userId,
    activityId: input.rootActivityId,
    sourceKey: input.rootActivityId,
    revision: input.bestAttempt.id,
    activityType: input.kind,
    occurredAt: input.bestAttempt.scoredAt,
    measurements: [
      {
        competency: 'pronunciation',
        value: input.bestAttempt.scores.pronunciation,
        accuracy: input.bestAttempt.scores.accuracy,
        prosody: input.bestAttempt.scores.prosody,
      },
    ],
    errorOccurrences: input.bestAttempt.failingPhonemes.map((group) => ({
      tag: group.tag,
      instances: group.instances,
      exampleWords: [...new Set(group.examples.map((example) => example.word))].slice(0, 5),
    })),
    correctEncounters,
  };
}
