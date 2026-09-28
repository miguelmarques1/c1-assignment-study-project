import { describe, expect, it } from 'vitest';

import { revisionSegments } from '../../src/writing/output/revision-diff';

function concat(segments: Array<{ text: string }>): string {
  return segments.map((s) => s.text).join('');
}

describe('revisionSegments', () => {
  it('segments_concatenate_to_the_revised_text_exactly', () => {
    const original = 'Dear Editor,\n\nI think the council should of listened to residents.';
    const revised = 'Dear Editor,\n\nI think the council should have listened to residents.';
    const segments = revisionSegments(original, revised);
    expect(concat(segments)).toBe(revised);
  });

  it('marks_changed_words', () => {
    const segments = revisionSegments('I has a dog.', 'I have a dog.');
    const changed = segments.filter((s) => s.changed).map((s) => s.text.trim());
    expect(changed).toContain('have');
    expect(segments.some((s) => !s.changed && s.text.includes('a dog'))).toBe(true);
  });

  it('keeps_paragraph_breaks_on_unchanged_segments', () => {
    const original = 'First paragraph here.\n\nSecond paragraph here.';
    const revised = 'First paragraph here.\n\nSecond paragraph here.';
    const segments = revisionSegments(original, revised);
    expect(concat(segments)).toBe(revised);
    expect(segments.every((s) => !s.changed)).toBe(true);
    expect(segments.some((s) => s.text.includes('\n\n'))).toBe(true);
  });

  it('case_and_punctuation_only_differences_follow_the_correction_diff', () => {
    const segments = revisionSegments('the Dog ran.', 'the dog ran.');
    expect(segments.every((s) => !s.changed)).toBe(true);
    expect(concat(segments)).toBe('the dog ran.');
  });

  it('an_identical_revision_has_no_changed_segment', () => {
    const text = 'Nothing changed in this sentence at all.';
    const segments = revisionSegments(text, text);
    expect(segments.every((s) => !s.changed)).toBe(true);
    expect(concat(segments)).toBe(text);
  });
});
