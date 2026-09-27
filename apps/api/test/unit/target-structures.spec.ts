import { describe, expect, it } from 'vitest';

import { verifyTargetStructures } from '../../src/generation/gate/target-structures';
import { committedGateData, loadFixture } from '../fixtures/generation/fixtures';

const { rules } = committedGateData();
const markers = rules.markers;

/** Three paragraphs of equal weight, so each third of the text holds one of them. */
const BODY = [
  'Had the council published its figures earlier, the vote would have gone the other way, and several collocations such as heavy rain appear here.',
  'If the officers had visited the branch, they might have changed their minds, while the committee made a decision about strong coffee.',
  'Had anyone asked the visitors, the report would have looked different, and the residents paid attention to the quiet reading room.',
].join('\n\n');

describe('target structures', () => {
  it('counts_distinct_verbatim_occurrences', () => {
    const report = verifyTargetStructures(
      BODY,
      ['grammar:conditional-3'],
      [
        { tag: 'grammar:conditional-3', quote: 'Had the council published its figures earlier, the vote would have gone the other way' },
        { tag: 'grammar:conditional-3', quote: 'If the officers had visited the branch, they might have changed their minds' },
        { tag: 'grammar:conditional-3', quote: 'Had anyone asked the visitors, the report would have looked different' },
      ],
      markers,
    );

    expect(report['grammar:conditional-3']).toEqual({ occurrences: 3, thirds: [1, 2, 3], rejected: [] });
  });

  it('rejects_quotes_not_found_in_the_body', () => {
    const report = verifyTargetStructures(
      BODY,
      ['grammar:conditional-3'],
      [{ tag: 'grammar:conditional-3', quote: 'Had the council released its data sooner, the vote would have gone differently' }],
      markers,
    );

    expect(report['grammar:conditional-3']?.occurrences).toBe(0);
    expect(report['grammar:conditional-3']?.rejected).toEqual([
      { quote: 'Had the council released its data sooner, the vote would have gone differently', reason: 'not in the text' },
    ]);
  });

  it('overlapping_or_repeated_quotes_count_once', () => {
    const report = verifyTargetStructures(
      BODY,
      ['vocab:collocation'],
      [
        { tag: 'vocab:collocation', quote: 'heavy rain' },
        { tag: 'vocab:collocation', quote: 'heavy rain' },
        { tag: 'vocab:collocation', quote: 'such as heavy rain appear' },
        { tag: 'vocab:collocation', quote: 'strong coffee' },
      ],
      markers,
    );

    expect(report['vocab:collocation']?.occurrences).toBe(2);
    expect(report['vocab:collocation']?.rejected.map((entry) => entry.reason)).toEqual([
      'overlaps another occurrence',
      'overlaps another occurrence',
    ]);
  });

  it('requires_a_marker_match_when_the_tag_has_markers', () => {
    const report = verifyTargetStructures(
      BODY,
      ['grammar:conditional-3'],
      [{ tag: 'grammar:conditional-3', quote: 'the committee made a decision about strong coffee' }],
      markers,
    );

    expect(report['grammar:conditional-3']?.rejected).toEqual([
      { quote: 'the committee made a decision about strong coffee', reason: 'no marker match' },
    ]);
  });

  it('tags_without_markers_rely_on_verbatim_presence', () => {
    expect(markers.has('vocab:collocation')).toBe(false);
    const report = verifyTargetStructures(
      BODY,
      ['vocab:collocation'],
      [
        { tag: 'vocab:collocation', quote: 'heavy rain' },
        { tag: 'vocab:collocation', quote: 'made a decision' },
        { tag: 'vocab:collocation', quote: 'paid attention' },
      ],
      markers,
    );

    expect(report['vocab:collocation']).toMatchObject({ occurrences: 3, thirds: [1, 2, 3] });
  });

  it('occurrences_must_span_two_thirds_of_the_text', () => {
    const filler = 'The committee met on Thursday and read the report aloud to the residents who had come. '.repeat(4);
    const body = `Perhaps the plan works. It may fail by spring. Arguably it is already late.\n\n${filler}\n\n${filler}`;
    const clustered = verifyTargetStructures(
      body,
      ['discourse:hedging'],
      [
        { tag: 'discourse:hedging', quote: 'Perhaps the plan works' },
        { tag: 'discourse:hedging', quote: 'It may fail by spring' },
        { tag: 'discourse:hedging', quote: 'Arguably it is already late' },
      ],
      markers,
    );

    expect(clustered['discourse:hedging']).toMatchObject({ occurrences: 3, thirds: [1] });

    const fixture = loadFixture('reading-library-letter');
    const spread = verifyTargetStructures(fixture.body, ['discourse:hedging'], fixture.target_occurrences, markers);
    expect(spread['discourse:hedging']?.thirds).toEqual([1, 2, 3]);
  });

  it('rejects_one_word_quotes_and_ignores_tags_that_were_not_required', () => {
    const report = verifyTargetStructures(
      BODY,
      ['vocab:collocation'],
      [
        { tag: 'vocab:collocation', quote: 'rain' },
        { tag: 'grammar:conditional-3', quote: 'Had anyone asked the visitors, the report would have looked different' },
      ],
      markers,
    );

    expect(Object.keys(report)).toEqual(['vocab:collocation']);
    expect(report['vocab:collocation']?.rejected).toEqual([{ quote: 'rain', reason: 'too short' }]);
  });
});
