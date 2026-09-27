import { describe, expect, it } from 'vitest';

import {
  acceptModelRationale,
  carriedOverRationale,
  pronunciationTaskRationale,
  speakingTaskRationale,
  templateRationale,
  writingTaskRationale,
  type RationaleContext,
} from '../../src/plans/composition/rationale';
import type { RankedPlanTag } from '../../src/plans/composition/tag-priority';
import { loadPlanRulesFile } from '../../src/plans/rules/plan-rules';
import { STUDY_PLAN_RULES_PATH } from '../../src/plans/plan.constants';

const { rules } = loadPlanRulesFile(STUDY_PLAN_RULES_PATH);

const labels: Record<string, string> = {
  'grammar:conditional-3': 'third conditional',
  'phoneme:/th/': '/th/',
};
const ctx: RationaleContext = { labelOf: (tag) => labels[tag] ?? tag };

function tag(overrides: Partial<RankedPlanTag> = {}): RankedPlanTag {
  return { tag: 'grammar:conditional-3', family: 'grammar', source: 'unmastered', rank: 1, sightings: null, ...overrides };
}

describe('templateRationale', () => {
  it('due_tag_uses_the_due_sentence', () => {
    expect(templateRationale(tag({ source: 'due' }), ctx)).toBe('Due for review: third conditional is back on your schedule.');
  });

  it('uses_the_n_of_m_lessons_sentence_when_seen_twice_or_more', () => {
    const t = tag({ sightings: { lessons: 4, of: 5, inLatest: true } });
    expect(templateRationale(t, ctx)).toBe('Chosen because third conditional appeared in 4 of your last 5 lessons.');
  });

  it('uses_the_last_lesson_sentence_when_seen_once_in_the_latest', () => {
    const t = tag({ sightings: { lessons: 1, of: 5, inLatest: true } });
    expect(templateRationale(t, ctx)).toBe('Chosen because third conditional came up in your last lesson.');
  });

  it('uses_the_one_of_your_last_m_sentence_when_seen_once_earlier', () => {
    const t = tag({ sightings: { lessons: 1, of: 5, inLatest: false } });
    expect(templateRationale(t, ctx)).toBe('Chosen because third conditional came up in one of your last 5 lessons.');
  });

  it('uses_the_error_list_sentence_without_lesson_evidence', () => {
    const t = tag({ sightings: null });
    expect(templateRationale(t, ctx)).toBe('Chosen because third conditional is still on your error list.');
  });

  it('uses_the_error_list_sentence_when_zero_lesson_sightings', () => {
    const t = tag({ sightings: { lessons: 0, of: 5, inLatest: false } });
    expect(templateRationale(t, ctx)).toBe('Chosen because third conditional is still on your error list.');
  });

  it('general_mode_sentence_with_no_primary_tag', () => {
    expect(templateRationale(null, ctx)).toBe('General C1 practice while your profile builds up.');
  });
});

describe('task rationales', () => {
  it('writing_task_names_its_label_and_lesson_count', () => {
    const t = tag({ sightings: { lessons: 3, of: 5, inLatest: true } });
    expect(writingTaskRationale(t, ctx)).toBe(
      'Writing practice built around third conditional, which appeared in 3 of your last 5 lessons.',
    );
  });

  it('writing_task_falls_back_without_lesson_evidence', () => {
    expect(writingTaskRationale(tag({ sightings: null }), ctx)).toBe('Writing practice built around third conditional.');
  });

  it('pronunciation_task_lists_every_phoneme_label', () => {
    const tags = [tag({ tag: 'phoneme:/th/', family: 'phoneme' })];
    expect(pronunciationTaskRationale(tags, ctx)).toBe('Read-aloud practice for /th/, sounds you missed in recent lessons.');
  });

  it('speaking_task_names_only_the_first_label', () => {
    expect(speakingTaskRationale([tag()], ctx)).toBe('Unscripted speaking practice with third conditional in mind.');
  });

  it('task_sentences_fall_back_to_general_mode_with_no_tags', () => {
    expect(writingTaskRationale(null, ctx)).toBe('General C1 practice while your profile builds up.');
    expect(pronunciationTaskRationale([], ctx)).toBe('General C1 practice while your profile builds up.');
    expect(speakingTaskRationale([], ctx)).toBe('General C1 practice while your profile builds up.');
  });
});

describe('carriedOverRationale', () => {
  it('names_the_tag_still_unmastered', () => {
    expect(carriedOverRationale('grammar:conditional-3', ctx)).toBe(
      'Carried over from your previous plan: third conditional is still unmastered.',
    );
  });

  it('falls_back_with_no_tag', () => {
    expect(carriedOverRationale(null, ctx)).toBe('Carried over from your previous plan.');
  });
});

describe('acceptModelRationale', () => {
  it('keeps_a_valid_one_line_sentence', () => {
    const text = 'Chosen because this targets a recent weak spot.';
    expect(acceptModelRationale(text, rules)).toBe(text);
  });

  it('rejects_multi_line_text', () => {
    expect(acceptModelRationale('First line.\nSecond line.', rules)).toBeNull();
  });

  it('rejects_text_shorter_than_the_minimum', () => {
    expect(acceptModelRationale('Too short', rules)).toBeNull();
  });

  it('rejects_text_longer_than_the_maximum', () => {
    expect(acceptModelRationale('x'.repeat(rules.model.rationaleChars.max + 1), rules)).toBeNull();
  });

  it('trims_surrounding_whitespace', () => {
    const text = '  Chosen because this targets a recent weak spot.  ';
    expect(acceptModelRationale(text, rules)).toBe(text.trim());
  });
});
