import { describe, expect, it } from 'vitest';

import { loadExcerptRulesFile, type ExcerptRules } from '../../src/excerpts/excerpt-rules';
import { EXCERPT_RULES_PATH } from '../../src/excerpts/excerpt-selection.constants';
import { excerptReason, selectExcerpts, type SelectableUtterance } from '../../src/excerpts/excerpt-selector';
import { NO_PRONUNCIATION_FOCUS, type PronunciationFocus } from '../../src/excerpts/pronunciation-focus.port';

/** The committed version 1 rules, so these boundaries are the ones in force. */
const RULES: ExcerptRules = loadExcerptRulesFile(EXCERPT_RULES_PATH).rules;

const MINUTE = 60_000;
const CONTENT = 'we should really consider moving the whole meeting to thursday afternoon instead'.split(' ');

let nextIdx = 0;

/** An utterance that passes every filter unless the override breaks one: 10 content words, 5 s, confidence 0.8. */
function utterance(overrides: Partial<SelectableUtterance> & { wordTexts?: string[] } = {}): SelectableUtterance {
  const idx = overrides.idx ?? nextIdx++;
  const startMs = overrides.startMs ?? idx * 10_000;
  const endMs = overrides.endMs ?? startMs + 5_000;
  const wordTexts = overrides.wordTexts ?? CONTENT.slice(0, 10);
  return {
    id: overrides.id ?? `00000000-0000-4000-8000-${String(idx).padStart(12, '0')}`,
    idx,
    startMs,
    endMs,
    text: overrides.text ?? wordTexts.join(' '),
    confidence: overrides.confidence === undefined ? 0.8 : overrides.confidence,
    words: overrides.words ?? wordTexts.map((text) => ({ text, confidence: null })),
  };
}

function withWords(count: number, fillers = 0, extra: Partial<SelectableUtterance> = {}): SelectableUtterance {
  const words = [...Array<string>(fillers).fill('um'), ...CONTENT, ...CONTENT].slice(0, count);
  return utterance({ ...extra, wordTexts: words });
}

function select(utterances: SelectableUtterance[], focus: PronunciationFocus = NO_PRONUNCIATION_FOCUS) {
  return selectExcerpts(utterances, RULES, focus);
}

const selectedIds = (utterances: SelectableUtterance[], focus?: PronunciationFocus) =>
  select(utterances, focus).selected.map((excerpt) => excerpt.utteranceId);

/** Eligible utterances spread 5 minutes apart, so spacing never interferes. */
function spreadOut(count: number, confidenceOf: (i: number) => number | null = () => 0.8): SelectableUtterance[] {
  return Array.from({ length: count }, (_, i) =>
    utterance({ idx: i, startMs: i * 5 * MINUTE, endMs: i * 5 * MINUTE + 5_000, confidence: confidenceOf(i) }),
  );
}

describe('selectExcerpts', () => {
  it('excludes_utterances_outside_3_to_30_seconds', () => {
    const durations = [2_999, 3_000, 30_000, 30_001];
    const utterances = durations.map((duration, i) =>
      utterance({ idx: i, startMs: i * 5 * MINUTE, endMs: i * 5 * MINUTE + duration }),
    );

    expect(selectedIds(utterances)).toEqual(expect.arrayContaining([utterances[1]!.id, utterances[2]!.id]));
    expect(select(utterances).selected).toHaveLength(2);
  });

  it('excludes_utterances_with_fewer_than_8_words', () => {
    const seven = withWords(7, 0, { idx: 0, startMs: 0 });
    const eight = withWords(8, 0, { idx: 1, startMs: 5 * MINUTE });

    expect(selectedIds([seven, eight])).toEqual([eight.id]);
  });

  it('counts_words_from_normalized_tokens', () => {
    // 8 tokens once punctuation is stripped and the lone dash dropped.
    const u = utterance({
      wordTexts: ['Well,', 'afternoon.', '—', 'I’d', 'rather', 'we', 'waited', 'a', 'bit'],
    });

    const [excerpt] = select([u]).selected;

    expect(excerpt?.wordCount).toBe(8);
  });

  it('falls_back_to_the_text_when_words_are_empty', () => {
    const u = utterance({ words: [], text: 'we should really consider moving the meeting again' });

    expect(select([u]).selected[0]?.wordCount).toBe(8);
  });

  it('excludes_utterances_with_more_than_40_percent_fillers', () => {
    const fortyPercent = utterance({
      idx: 0,
      startMs: 0,
      wordTexts: ['Yeah,', 'UM', 'right', 'okay.', 'we', 'should', 'move', 'the', 'meeting', 'again'],
    });
    const fiftyPercent = utterance({
      idx: 1,
      startMs: 5 * MINUTE,
      wordTexts: ['yeah', 'um', 'uh', 'right', 'okay', 'we', 'should', 'move', 'the', 'meeting'],
    });

    const result = select([fortyPercent, fiftyPercent]);

    expect(result.selected.map((excerpt) => excerpt.utteranceId)).toEqual([fortyPercent.id]);
    expect(result.selected[0]?.fillerShare).toBeCloseTo(0.4);
  });

  it('excludes_utterance_confidence_below_0_40', () => {
    const [low, edge] = spreadOut(2, (i) => (i === 0 ? 0.39 : 0.4));

    expect(selectedIds([low!, edge!])).toEqual([edge!.id]);
  });

  it('uses_word_confidence_when_every_word_has_it', () => {
    const scored = (i: number, lowCount: number) =>
      utterance({
        idx: i,
        startMs: i * 5 * MINUTE,
        confidence: 0.1,
        words: CONTENT.slice(0, 8).map((text, w) => ({ text, confidence: w < lowCount ? 0.2 : 0.9 })),
      });
    const quarter = scored(0, 2);
    const overQuarter = scored(1, 3);

    const result = select([quarter, overQuarter]);

    expect(result.selected.map((excerpt) => excerpt.utteranceId)).toEqual([quarter.id]);
    // Ranked on the mean word confidence, not the utterance's 0.1.
    expect(result.selected[0]?.confidence).toBeCloseTo((2 * 0.2 + 6 * 0.9) / 8);
  });

  it('a_partial_word_confidence_falls_back_to_the_utterance', () => {
    const u = utterance({
      confidence: 0.55,
      words: CONTENT.slice(0, 8).map((text, w) => ({ text, confidence: w === 0 ? 0.1 : null })),
    });

    expect(select([u]).selected[0]?.confidence).toBe(0.55);
  });

  it('an_utterance_without_any_confidence_stays_eligible_and_ranks_last', () => {
    const [unknown, measured] = spreadOut(2, (i) => (i === 0 ? null : 0.95));

    expect(selectedIds([unknown!, measured!])).toEqual([measured!.id, unknown!.id]);
  });

  it('ranks_lower_confidence_before_higher', () => {
    const utterances = spreadOut(3, (i) => [0.91, 0.62, 0.78][i]!);

    expect(selectedIds(utterances)).toEqual([utterances[1]!.id, utterances[2]!.id, utterances[0]!.id]);
  });

  it('breaks_confidence_ties_by_focus_words_then_duration_then_index', () => {
    const focus: PronunciationFocus = { source: 'test', tags: ['phoneme:/θ/'], matchesWord: (t) => t === 'think' };
    const plain = (i: number, durationMs: number) =>
      utterance({ idx: i, startMs: i * 5 * MINUTE, endMs: i * 5 * MINUTE + durationMs });
    const firstShort = plain(0, 4_000);
    const long = plain(1, 9_000);
    const secondShort = plain(2, 4_000);
    const withFocusWord = utterance({
      idx: 3,
      startMs: 3 * 5 * MINUTE,
      endMs: 3 * 5 * MINUTE + 3_500,
      wordTexts: CONTENT.slice(0, 10).map((word, w) => (w === 0 ? 'Think,' : word)),
    });

    const result = select([firstShort, long, secondShort, withFocusWord], focus);

    expect(result.selected.map((excerpt) => excerpt.utteranceId)).toEqual([
      withFocusWord.id,
      long.id,
      firstShort.id,
      secondShort.id,
    ]);
    expect(result.selected[0]?.focusWordCount).toBe(1);
  });

  it('never_selects_more_than_12', () => {
    const utterances = spreadOut(60).map((u, i) => ({ ...u, startMs: i * MINUTE, endMs: i * MINUTE + 5_000 }));

    expect(select(utterances).selected).toHaveLength(12);
  });

  it('never_places_more_than_3_in_any_5_minute_window', () => {
    // 100 eligible utterances packed into 20 minutes, confidences scrambled.
    const utterances = Array.from({ length: 100 }, (_, i) =>
      utterance({ idx: i, startMs: i * 12_000, endMs: i * 12_000 + 4_000, confidence: 0.4 + ((i * 37) % 60) / 100 }),
    );

    const starts = select(utterances)
      .selected.map((excerpt) => excerpt.startMs)
      .sort((a, b) => a - b);

    expect(starts.length).toBeGreaterThan(0);
    for (const t of starts) {
      expect(starts.filter((s) => s >= t && s < t + 5 * MINUTE).length).toBeLessThanOrEqual(3);
    }
  });

  it('a_short_lesson_selects_at_most_3', () => {
    const utterances = Array.from({ length: 10 }, (_, i) =>
      utterance({ idx: i, startMs: i * 24_000, endMs: i * 24_000 + 5_000 }),
    );

    const result = select(utterances);

    expect(result.eligibleCount).toBe(10);
    expect(result.selected).toHaveLength(3);
    expect(result.sparse).toBe(true);
  });

  it('selects_every_eligible_utterance_when_fewer_than_4', () => {
    const eligible = spreadOut(3);
    const tooShort = Array.from({ length: 37 }, (_, i) =>
      utterance({ idx: 100 + i, startMs: 20 * MINUTE + i * 3_000, endMs: 20 * MINUTE + i * 3_000 + 1_500 }),
    );

    const result = select([...eligible, ...tooShort]);

    expect(result.utteranceCount).toBe(40);
    expect(result.eligibleCount).toBe(3);
    expect(result.selected.map((excerpt) => excerpt.utteranceId).sort()).toEqual(eligible.map((u) => u.id).sort());
    expect(result.sparse).toBe(true);
  });

  it('flags_sparse_when_spacing_leaves_fewer_than_4', () => {
    const utterances = Array.from({ length: 6 }, (_, i) =>
      utterance({ idx: i, startMs: i * 30_000, endMs: i * 30_000 + 5_000 }),
    );

    const result = select(utterances);

    expect(result.eligibleCount).toBe(6);
    expect(result.selected).toHaveLength(3);
    expect(result.sparse).toBe(true);
  });

  it('zero_eligible_yields_an_empty_sparse_selection', () => {
    const result = select([withWords(4), utterance({ endMs: 1_000, startMs: 0 })]);

    expect(result).toEqual({ utteranceCount: 2, eligibleCount: 0, selected: [], selectedAudioMs: 0, sparse: true });
  });

  it('four_or_more_selected_is_not_sparse', () => {
    expect(select(spreadOut(4)).sparse).toBe(false);
  });

  it('is_deterministic_for_the_same_input_and_rules', () => {
    const utterances = Array.from({ length: 80 }, (_, i) =>
      utterance({
        idx: i,
        startMs: i * 40_000,
        endMs: i * 40_000 + 3_000 + ((i * 7919) % 27_000),
        confidence: [0.83, 0.83, 0.71, 0.9, null][i % 5]!,
      }),
    );
    const baseline = select(utterances);

    for (let seed = 1; seed <= 5; seed++) {
      const shuffled = [...utterances].sort((a, b) => ((a.idx * seed * 31) % 97) - ((b.idx * seed * 31) % 97));
      expect(select(shuffled)).toEqual(baseline);
      expect(select(shuffled)).toEqual(baseline);
    }
  });

  it('total_selected_audio_stays_within_6_minutes', () => {
    const utterances = Array.from({ length: 50 }, (_, i) =>
      utterance({ idx: i, startMs: i * 72_000, endMs: i * 72_000 + 30_000 }),
    );

    const result = select(utterances);

    expect(result.selected).toHaveLength(12);
    expect(result.selectedAudioMs).toBeLessThanOrEqual(6 * MINUTE);
  });

  it('copies_the_utterance_range_and_text_verbatim', () => {
    const u = utterance({ startMs: 412_030, endMs: 426_410, text: "I'd rather we postponed it, honestly." });

    expect(select([u]).selected[0]).toMatchObject({
      utteranceId: u.id,
      rank: 1,
      startMs: 412_030,
      endMs: 426_410,
      durationMs: 14_380,
      referenceText: "I'd rather we postponed it, honestly.",
    });
  });

  it('writes_the_reason_sentence', () => {
    const base = { confidence: 0.6214, wordCount: 14, durationMs: 6_200, focusWordCount: 0 };

    expect(excerptReason(base)).toBe('Selected: recognition confidence 0.62, 14 words');
    expect(excerptReason({ ...base, focusWordCount: 1 })).toBe(
      "Selected: recognition confidence 0.62, 14 words, 1 word with sounds you're practicing",
    );
    expect(excerptReason({ ...base, focusWordCount: 3 })).toBe(
      "Selected: recognition confidence 0.62, 14 words, 3 words with sounds you're practicing",
    );
    expect(excerptReason({ ...base, confidence: null })).toBe('Selected: 14 words, 6.2 seconds');
    expect(select([utterance({ confidence: 0.6214 })]).selected[0]?.reason).toBe(
      'Selected: recognition confidence 0.62, 10 words',
    );
  });

  it('selects_a_60_minute_transcript_quickly', () => {
    const utterances = Array.from({ length: 1_000 }, (_, i) =>
      utterance({ idx: i, startMs: i * 3_600, endMs: i * 3_600 + 2_000 + (i % 20) * 1_000, confidence: 0.5 + (i % 40) / 100 }),
    );

    const started = performance.now();
    const result = select(utterances);
    const elapsed = performance.now() - started;

    expect(result.selected).toHaveLength(12);
    expect(elapsed).toBeLessThan(100);
  });
});
