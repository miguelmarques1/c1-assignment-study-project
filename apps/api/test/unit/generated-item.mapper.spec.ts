import { describe, expect, it } from 'vitest';

import { validateGeneratedInput } from '../../src/content/content-item.validation';
import { generatedSlug, mapGeneratedOutput, skillsFor } from '../../src/generation/generated-item.mapper';
import { CONTENT_SLUG_PATTERN } from '@english-quest/shared';
import { committedGateData, responseForSlot, slotSpec } from '../fixtures/generation/fixtures';

const data = committedGateData();
const stamp = { promptId: 'reading-generate', promptVersion: '2' };

describe('generated item mapper', () => {
  it('maps_multiple_choice_and_fill_blank_to_the_bank_question_union', () => {
    const slot = slotSpec();
    const mapped = mapGeneratedOutput(responseForSlot('reading', slot.targetTags), slot, stamp, data.rules.rules, data.taxonomy);

    expect(mapped.input.questions[0]).toEqual({
      format: 'multiple_choice',
      prompt: 'According to the writer, what should the council have done before the vote?',
      options: ['Published its footfall figures', 'Sold the building', 'Surveyed its online members', 'Increased the library budget'],
      answer: 'Published its footfall figures',
      explanation: 'The writer says the consultation would have looked different had the figures been published before the vote.',
    });
    expect(mapped.input.questions[4]).toMatchObject({ format: 'fill_blank', answer: ['postpone', 'delay'] });
  });

  it('strips_evidence_and_occurrences_from_questions', () => {
    const slot = slotSpec();
    const mapped = mapGeneratedOutput(responseForSlot('reading', slot.targetTags), slot, stamp, data.rules.rules, data.taxonomy);

    expect(JSON.stringify(mapped.input.questions)).not.toContain('evidence');
    expect(mapped.modelQuestions.every((question) => question.evidence.length > 0)).toBe(true);
    expect(mapped.occurrences.length).toBeGreaterThan(0);
    expect(validateGeneratedInput({ ...mapped.input, gateMetrics: { word_count: 491 } }, data.taxonomy).ok).toBe(true);
  });

  it('target_tags_come_from_the_slot_not_the_model', () => {
    const slot = slotSpec();
    const output = { ...responseForSlot('reading', slot.targetTags), target_tags: ['remote-work'] };
    const mapped = mapGeneratedOutput(output, slot, stamp, data.rules.rules, data.taxonomy);

    expect(mapped.input.targetTags).toEqual(['grammar:conditional-3', 'discourse:hedging']);
  });

  it('derives_skills_from_type_and_tag_families', () => {
    expect(skillsFor('reading', ['grammar:conditional-3', 'discourse:hedging'], data.taxonomy)).toEqual(['reading', 'grammar']);
    expect(skillsFor('error_review', ['vocab:collocation'], data.taxonomy)).toEqual(['vocabulary', 'reading']);
    expect(skillsFor('grammar', ['grammar:passive-voice'], data.taxonomy)).toEqual(['grammar', 'reading']);
    expect(skillsFor('error_review', ['discourse:connector'], data.taxonomy)).toEqual(['reading']);
  });

  it('slug_is_derived_from_the_slot_id', () => {
    const slug = generatedSlug('error_review', '3F2A9C1E-0B7D-4E5F-8A61-0B2C3D4E5F60');

    expect(slug).toBe('gen-error-review-3f2a9c1e0b7d');
    expect(slug).toMatch(CONTENT_SLUG_PATTERN);
  });

  it('reports_a_multiple_choice_without_options_as_a_question_issue', () => {
    const slot = slotSpec();
    const output = responseForSlot('reading', slot.targetTags);
    delete output.questions[0]!.options;

    const mapped = mapGeneratedOutput(output, slot, stamp, data.rules.rules, data.taxonomy);
    const validation = validateGeneratedInput({ ...mapped.input, gateMetrics: { x: 1 } }, data.taxonomy);

    expect(validation.ok).toBe(false);
    expect(validation.ok ? [] : validation.issues.map((issue) => issue.path)).toContain('/questions/0/options');
  });

  it('survives_output_that_is_not_an_object', () => {
    const mapped = mapGeneratedOutput(null, slotSpec(), stamp, data.rules.rules, data.taxonomy);

    expect(mapped.input.body).toBe('');
    expect(mapped.modelQuestions).toEqual([]);
  });

  it('stamps_cefr_level_difficulty_and_prompt_version', () => {
    const slot = slotSpec({ type: 'grammar', targetTags: ['grammar:passive-voice'] });
    const mapped = mapGeneratedOutput(responseForSlot('grammar', slot.targetTags), slot, { promptId: 'grammar-generate', promptVersion: '2' }, data.rules.rules, data.taxonomy);

    expect(mapped.input).toMatchObject({ cefrLevel: 'C1', difficulty: 4, promptId: 'grammar-generate', promptVersion: '2', type: 'grammar' });
  });
});
