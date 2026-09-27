import { describe, expect, it } from 'vitest';

import { renderDryRun, renderSlotLine, renderSummary, type ReportSlot } from '../../src/generation/cli/generate-report';
import type { GenerationRunResult } from '../../src/generation/generation.contract';

function slot(overrides: Partial<ReportSlot>): ReportSlot {
  return {
    position: 1,
    type: 'reading',
    targetTags: ['grammar:conditional-3', 'discourse:hedging'],
    outcome: 'generated',
    contentItemId: '5a1e2f3c-7b8d-4e9f-a0b1-c2d3e4f5a6b7',
    reason: null,
    attempts: 1,
    genre: 'obituary',
    tagSources: [],
    attemptsDetail: [{ attempt: 1, outcome: 'passed', failedChecks: [], failures: [], wordCount: 612, outOfFrequencyRatio: 0.141 }],
    itemSlug: 'gen-reading-3f2a9c1e0b7d',
    ...overrides,
  };
}

function result(overrides: Partial<GenerationRunResult>): GenerationRunResult {
  return {
    runId: 'run',
    runKey: 'cli:x',
    abandonReason: null,
    slots: [],
    counts: { planned: 12, generated: 9, fallback: 2, dropped: 1 },
    notes: [],
    ...overrides,
  };
}

describe('generate report', () => {
  it('formats_generated_regenerated_fallback_and_dropped_lines', () => {
    expect(renderSlotLine(slot({}))).toMatch(
      /^✓ {2}1 reading\s+grammar:conditional-3, discourse:hedging\s+passed on attempt 1 · 612 words · OOF 14\.1% · gen-reading-3f2a9c1e0b7d$/,
    );

    const regenerated = slot({
      position: 2,
      type: 'grammar',
      targetTags: ['grammar:passive-voice'],
      attempts: 2,
      attemptsDetail: [
        { attempt: 1, outcome: 'gate_failed', failedChecks: ['out_of_frequency_ratio'], failures: [{ check: 'out_of_frequency_ratio', measured: 0.108, min: 0.12, cutoff: 3000 }], wordCount: 320, outOfFrequencyRatio: 0.108 },
        { attempt: 2, outcome: 'passed', failedChecks: [], failures: [], wordCount: 330, outOfFrequencyRatio: 0.131 },
      ],
      itemSlug: 'gen-grammar-8e1d00000000',
    });
    expect(renderSlotLine(regenerated)).toContain('↻  2 grammar');
    expect(renderSlotLine(regenerated)).toContain('passed on attempt 2 (attempt 1: out_of_frequency_ratio 10.8% < 12.0%) · 330 words · OOF 13.1%');

    const twice = [
      { attempt: 1, outcome: 'gate_failed', failedChecks: ['target_structures', 'banned_phrases'], failures: [], wordCount: 300, outOfFrequencyRatio: 0.13 },
      { attempt: 2, outcome: 'gate_failed', failedChecks: ['answer_evidence'], failures: [], wordCount: 300, outOfFrequencyRatio: 0.13 },
    ];
    expect(renderSlotLine(slot({ position: 3, type: 'vocabulary', outcome: 'fallback', reason: 'gate_failed_twice', attemptsDetail: twice, itemSlug: 'ted-urban-vocab' }))).toMatch(
      /^✗ {2}3 vocabulary .*failed twice \(target_structures, banned_phrases; answer_evidence\) → curated ted-urban-vocab$/,
    );
    expect(renderSlotLine(slot({ position: 4, type: 'error_review', outcome: 'dropped', contentItemId: null, reason: 'gate_failed_twice', attemptsDetail: twice, itemSlug: null }))).toMatch(
      /^– {2}4 error_review .*→ dropped: no curated error_review item$/,
    );
    expect(renderSlotLine(slot({ outcome: 'dropped', contentItemId: null, reason: 'quota_exhausted', attemptsDetail: [], itemSlug: null }))).toContain(
      'not generated (quota_exhausted) → dropped',
    );
  });

  it('summary_prints_counts_and_notes', () => {
    expect(renderSummary(result({}))).toBe('12 planned: 9 generated, 2 fallback, 1 dropped. Notes: none');
    expect(
      renderSummary(result({ notes: [{ code: 'gemini_key_missing', text: 'Some activities use existing material because your Gemini key is missing.' }] })),
    ).toContain('Notes: Some activities use existing material because your Gemini key is missing.');
    expect(renderSummary(result({ counts: { planned: 0, generated: 0, fallback: 0, dropped: 0 } }))).toMatch(/^Nothing planned/);
  });

  it('dry_run_lists_planned_slots_with_their_sources', () => {
    const lines = renderDryRun('ana@example.com', [
      {
        position: 1,
        type: 'reading',
        targetTags: ['grammar:conditional-3', 'discourse:hedging'],
        tagSources: [
          { tag: 'grammar:conditional-3', source: 'recurring', rank: 1 },
          { tag: 'discourse:hedging', source: 'unmastered', rank: 6 },
        ],
        genre: 'letter to the editor',
        topicDomain: 'housing',
        exemplarIndex: 1,
      },
    ]);

    expect(lines[0]).toBe('Dry run — nothing was generated or written.');
    expect(lines[2]).toContain('grammar:conditional-3 (recurring #1), discourse:hedging (unmastered #6)');
    expect(lines[2]).toContain('genre: letter to the editor · domain: housing · exemplar 2');
  });
});
