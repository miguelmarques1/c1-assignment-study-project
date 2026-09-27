import type { GateFailure } from '../generation.contract';

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function describe(failure: GateFailure): string {
  switch (failure.check) {
    case 'word_count':
      return `word_count: the text has ${failure.measured} words; it must have between ${failure.min} and ${failure.max}.`;
    case 'mean_sentence_length':
      return (
        `mean_sentence_length: sentences average ${failure.measured.toFixed(1)} words; ` +
        `the average must be between ${failure.min} and ${failure.max}.`
      );
    case 'type_token_ratio':
      return (
        `type_token_ratio: ${failure.measured.toFixed(3)} of the words are distinct; at least ${failure.min} is required. ` +
        'Repeat fewer words and vary the vocabulary.'
      );
    case 'out_of_frequency_ratio':
      return (
        `out_of_frequency_ratio: ${percent(failure.measured)} of counted words are outside the ` +
        `${failure.cutoff.toLocaleString('en-US')} most frequent English lemmas; at least ${percent(failure.min)} is required.`
      );
    case 'target_structures':
      return `target_structures: ${failure.tags
        .map(
          (tag) =>
            `${tag.tag} has ${plural(tag.occurrences, 'verified occurrence')} in ${plural(tag.thirds, 'third')} of the text` +
            (tag.rejected > 0 ? ` (${tag.rejected} rejected: each quote must be copied exactly from the text and must use the structure)` : '') +
            `; at least ${tag.minOccurrences} are required, in at least ${tag.minThirds} of the text's thirds`,
        )
        .join('; ')}.`;
    case 'banned_phrases':
      return `banned_phrases: remove ${failure.found.map((entry) => `"${entry.phrase}" (${entry.count})`).join(', ')}.`;
    case 'questions':
      return `questions: ${failure.issues.join('; ')}.`;
    case 'answer_evidence':
      return `answer_evidence: ${failure.issues.join('; ')}.`;
    case 'item_shape':
      return `item_shape: ${failure.issues.join('; ')}.`;
    case 'learner_quotes':
      return (
        `learner_quotes: the text reuses the learner's own sentences (${plural(failure.reproduced, 'sentence')}). ` +
        'Model the correct form in new sentences of your own.'
      );
  }
}

/**
 * The regeneration appendix (PRD F14: "the specific failed checks appended
 * to the prompt as correction instructions"). Each line carries the measured
 * and the required value. It never quotes the item or a learner sentence:
 * the model already has the prompt, and the notes may end up in logs.
 */
export function renderGateFeedback(failures: readonly GateFailure[]): string {
  const lines = failures.map((failure) => `- ${describe(failure)}`);
  return [
    'Correction needed: your previous draft failed these checks. Write a complete new version that fixes every one of them, ' +
      'keeping the same genre, topic domain and target structures.',
    ...lines,
  ].join('\n');
}
