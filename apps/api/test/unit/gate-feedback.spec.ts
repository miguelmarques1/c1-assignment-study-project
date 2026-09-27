import { describe, expect, it } from 'vitest';

import { evaluateGate } from '../../src/generation/gate/difficulty-gate';
import { renderGateFeedback } from '../../src/generation/gate/gate-feedback';
import type { GateFailure } from '../../src/generation/generation.contract';
import { mapGeneratedOutput } from '../../src/generation/generated-item.mapper';
import { committedGateData, responseForSlot, slotSpec } from '../fixtures/generation/fixtures';

describe('gate feedback', () => {
  it('lists_each_failed_check_with_measured_and_required_values', () => {
    const failures: GateFailure[] = [
      { check: 'out_of_frequency_ratio', measured: 0.108, min: 0.12, cutoff: 3000 },
      { check: 'word_count', measured: 431, min: 450, max: 700 },
      {
        check: 'target_structures',
        tags: [{ tag: 'grammar:conditional-3', occurrences: 2, thirds: 1, rejected: 1, minOccurrences: 3, minThirds: 2 }],
      },
    ];

    const text = renderGateFeedback(failures);
    const lines = text.split('\n');

    expect(lines[0]).toMatch(/^Correction needed: your previous draft failed these checks\./);
    expect(lines).toHaveLength(4);
    expect(text).toContain('10.8% of counted words are outside the 3,000 most frequent English lemmas; at least 12.0% is required');
    expect(text).toContain('the text has 431 words; it must have between 450 and 700');
    expect(text).toContain('grammar:conditional-3 has 2 verified occurrences in 1 third of the text (1 rejected');
    expect(text).toContain('at least 3 are required, in at least 2 of the text');
  });

  it('names_the_banned_phrases_found', () => {
    const text = renderGateFeedback([
      {
        check: 'banned_phrases',
        found: [
          { phrase: 'delve into', count: 1 },
          { phrase: "in today's fast-paced world", count: 2 },
        ],
      },
    ]);

    expect(text).toContain('remove "delve into" (1), "in today\'s fast-paced world" (2)');
  });

  it('omits_passed_checks', () => {
    const text = renderGateFeedback([{ check: 'type_token_ratio', measured: 0.41, min: 0.45 }]);

    expect(text).toContain('type_token_ratio');
    for (const passing of ['word_count', 'mean_sentence_length', 'out_of_frequency_ratio', 'banned_phrases', 'questions']) {
      expect(text).not.toContain(passing);
    }
  });

  it('never_contains_item_text_or_learner_quotes', () => {
    const data = committedGateData();
    const slot = slotSpec();
    const output = responseForSlot('reading', slot.targetTags);
    const learnerQuote = 'we visited the old harbour museum at dawn';
    output.body = output.body.replace('On a wet Tuesday afternoon', `${learnerQuote}, and on a wet Tuesday afternoon`);
    output.questions[0]!.evidence = 'the council published everything in advance';
    const mapped = mapGeneratedOutput(output, slot, { promptId: 'reading-generate', promptVersion: '2' }, data.rules.rules, data.taxonomy);
    const report = evaluateGate(mapped, { ...data, slot, promptBannedPhrases: [], learnerQuotes: [learnerQuote] });

    const text = renderGateFeedback(report.failures);

    expect(report.failedChecks).toEqual(['answer_evidence', 'learner_quotes']);
    expect(text).not.toContain('harbour');
    expect(text).not.toContain('Marlowe');
    expect(text).not.toContain('published everything');
    expect(text).toContain("reuses the learner's own sentences (1 sentence)");
  });
});
