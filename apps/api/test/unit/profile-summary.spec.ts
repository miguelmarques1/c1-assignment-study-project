import { describe, expect, it } from 'vitest';

import {
  estimateTokens,
  renderCompactSummary,
  type SummaryCompetency,
  type SummaryExample,
  type SummaryWeakness,
} from '../../src/profile/profile-summary';
import { PROFILE_COMPETENCIES, SUMMARY_TOKEN_BUDGET } from '../../src/profile/profile.constants';

function competencies(overrides: Partial<Record<string, Partial<SummaryCompetency>>> = {}): SummaryCompetency[] {
  return PROFILE_COMPETENCIES.map((competency) => ({
    competency,
    score: 71.6,
    measurementCount: 4,
    warmingUp: false,
    trend: 'up' as const,
    accuracy: competency === 'pronunciation' ? 80.5 : null,
    prosody: competency === 'pronunciation' ? 66.2 : null,
    ...overrides[competency],
  }));
}

function weakness(index: number, label = `Weakness number ${index}`): SummaryWeakness {
  return { tag: `grammar:tag-${String(index).padStart(2, '0')}`, label, occurrenceCount: 20 - index, recentOccurrenceCount: 3 };
}

function example(tag: string, quote: string | null, exampleWords: string[] = []): SummaryExample {
  return { tag, quote, exampleWords };
}

describe('compact profile summary', () => {
  it('renders_six_scores_with_counts_and_warming_up', () => {
    const { text } = renderCompactSummary(
      competencies({ interaction: { score: 77.2, measurementCount: 2, warmingUp: true, trend: null } }),
      [],
      [],
    );

    expect(text).toContain('- Grammar: 72 (4 measurements, trend up)');
    expect(text).toContain('- Interaction: 77 (warming up, 2 measurements)');
    expect(text).toContain('- Pronunciation: 72 (4 measurements, trend up); accuracy 81, prosody 66');
    for (const name of ['Grammar', 'Vocabulary', 'Fluency', 'Interaction', 'Comprehension', 'Pronunciation']) {
      expect(text).toContain(`- ${name}:`);
    }
  });

  it('caps_weaknesses_at_ten_and_examples_at_six', () => {
    const weaknesses = Array.from({ length: 14 }, (_, index) => weakness(index));
    const examples = weaknesses.map((entry) => example(entry.tag, `A sentence for ${entry.tag}.`));

    const summary = renderCompactSummary(competencies(), weaknesses, examples);

    expect(summary.tagsIncluded).toEqual(weaknesses.slice(0, 10).map((entry) => entry.tag));
    expect(summary.examplesIncluded).toBe(6);
    const exampleLines = summary.text.split('\n').filter((line) => line.startsWith('- grammar:') && line.includes('"'));
    expect(exampleLines.map((line) => line.slice(2, line.indexOf(':', 10)))).toEqual(
      weaknesses.slice(0, 6).map((entry) => entry.tag),
    );
    expect(summary.text).not.toContain('grammar:tag-10');
  });

  it('never_exceeds_1500_estimated_tokens', () => {
    const longLabel = 'L'.repeat(120);
    const weaknesses = Array.from({ length: 77 }, (_, index) => ({
      tag: `grammar:${'x'.repeat(50)}-${String(index).padStart(2, '0')}`,
      label: longLabel,
      occurrenceCount: 32_767,
      recentOccurrenceCount: 32_767,
    }));
    const examples = weaknesses.map((entry) => example(entry.tag, 'q'.repeat(500)));

    const summary = renderCompactSummary(
      competencies({ pronunciation: { measurementCount: 100_000 } }),
      weaknesses,
      examples,
    );

    expect(summary.estimatedTokens).toBeLessThanOrEqual(SUMMARY_TOKEN_BUDGET);
    expect(summary.estimatedTokens).toBe(estimateTokens(summary.text));
    // The caps alone keep the maximal input inside the budget: nothing had to be dropped.
    expect(summary.tagsIncluded).toHaveLength(10);
    expect(summary.examplesIncluded).toBe(6);
    const quotes = [...summary.text.matchAll(/"([^"]*)"/g)].map((match) => match[1]!);
    expect(quotes).toHaveLength(6);
    expect(quotes.every((quote) => quote.length <= 160)).toBe(true);
  });

  it('drops_examples_before_weaknesses_when_over_budget', () => {
    const weaknesses = Array.from({ length: 10 }, (_, index) => weakness(index));
    const examples = weaknesses.map((entry) => example(entry.tag, 'This sentence is long enough to matter. '.repeat(3)));
    const full = renderCompactSummary(competencies(), weaknesses, examples);

    const withoutOneExample = renderCompactSummary(competencies(), weaknesses, examples, full.estimatedTokens - 1);
    expect(withoutOneExample.examplesIncluded).toBe(5);
    expect(withoutOneExample.tagsIncluded).toHaveLength(10);

    const tight = renderCompactSummary(competencies(), weaknesses, examples, 200);
    expect(tight.examplesIncluded).toBe(0);
    expect(tight.tagsIncluded.length).toBeLessThan(10);
    expect(tight.tagsIncluded).toEqual(weaknesses.slice(0, tight.tagsIncluded.length).map((entry) => entry.tag));
    expect(tight.estimatedTokens).toBeLessThanOrEqual(200);
  });

  it('an_empty_profile_renders_a_minimal_summary', () => {
    const { text, tagsIncluded, examplesIncluded } = renderCompactSummary([], [], []);

    expect(text).toContain('- Grammar: not measured yet');
    expect(text).toContain('- Pronunciation: not measured yet');
    expect(text).not.toContain('Recurring weaknesses');
    expect(text).not.toContain('Examples');
    expect(tagsIncluded).toEqual([]);
    expect(examplesIncluded).toBe(0);
  });

  it('never_contains_raw_history', () => {
    const weaknesses = Array.from({ length: 8 }, (_, index) => weakness(index));
    const examples = [
      ...weaknesses.map((entry) => example(entry.tag, `Quote for ${entry.tag}.`)),
      // An example for a tag outside the recurring list, and a phoneme example with words only.
      example('grammar:not-recurring', 'This must never appear.'),
    ];
    const withPhoneme = [{ tag: 'phoneme:/θ/', label: '/θ/ as in "think"', occurrenceCount: 30, recentOccurrenceCount: 4 }, ...weaknesses];

    const { text } = renderCompactSummary(competencies(), withPhoneme, [
      example('phoneme:/θ/', null, ['think', 'three']),
      ...examples,
    ]);

    expect(text).toContain('- phoneme:/θ/: words "think", "three"');
    expect(text).not.toContain('This must never appear.');
    const blocks = text.split('\n\n');
    expect(blocks).toHaveLength(4);
    expect(blocks[3]!.split('\n').slice(1)).toHaveLength(6);
  });
});
