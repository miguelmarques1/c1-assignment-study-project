import { describe, expect, it } from 'vitest';

import {
  parseMetaJson,
  toJsonPointer,
  validateCuratedMeta,
  validateGeneratedInput,
} from '../../src/content/content-item.validation';
import {
  FIXTURE_TAGS,
  fiveQuestions,
  fixtureTaxonomy,
  fixtureTaxonomyWith,
  generatedInput,
  listeningMeta,
  multipleChoice,
} from '../integration/helpers/content-fixtures';

const taxonomy = fixtureTaxonomy();

function issuesOf(result: { ok: boolean; issues?: string[] }): string[] {
  return result.ok ? [] : (result.issues ?? []);
}

describe('content item validation chokepoint', () => {
  it('formats_issue_paths_as_json_pointers', () => {
    expect(toJsonPointer(['questions', 2, 'answer'])).toBe('/questions/2/answer');
    expect(toJsonPointer([])).toBe('(root)');
    expect(toJsonPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d');

    const questions = fiveQuestions();
    questions[2] = multipleChoice({ answer: 'Not an option' });
    expect(issuesOf(validateCuratedMeta('listening', listeningMeta({ questions }), taxonomy))).toEqual([
      '/questions/2/answer must be one of /questions/2/options',
    ]);
    expect(issuesOf(validateCuratedMeta('listening', 'not an object', taxonomy))[0]).toMatch(/^\(root\) /);
  });

  it('reports_every_issue_not_just_the_first', () => {
    const { title: _title, ...meta } = listeningMeta({ difficulty: 9, target_tags: ['vocab:foo'] });
    expect(issuesOf(validateCuratedMeta('listening', meta, taxonomy))).toEqual([
      '/title is required',
      '/difficulty must be between 1 and 5',
      '/target_tags/0 "vocab:foo" is not in the error taxonomy (vfixture-1)',
    ]);
  });

  it('reports_invalid_json_with_the_parser_message', () => {
    const result = parseMetaJson('{ "title": "x", }');
    expect(result.ok).toBe(false);
    expect(issuesOf(result)[0]).toMatch(/^invalid JSON: /);
    expect(parseMetaJson(`${String.fromCharCode(0xfeff)}{"a":1}`)).toEqual({ ok: true, value: { a: 1 } });
  });

  it('ignores_the_dollar_schema_key', () => {
    const result = validateCuratedMeta('listening', listeningMeta({ $schema: '../meta.schema.json' }), taxonomy);
    expect(result.ok).toBe(true);
  });

  it('names_an_unknown_key_at_its_own_pointer', () => {
    expect(issuesOf(validateCuratedMeta('listening', listeningMeta({ dificulty: 3 }), taxonomy))).toEqual([
      '/dificulty is not a recognized field',
    ]);
  });

  it('generated_input_goes_through_the_same_question_rules', () => {
    const questions = fiveQuestions();
    questions[4] = multipleChoice({ answer: 'Nope' });
    expect(issuesOf(validateGeneratedInput(generatedInput({ questions }), taxonomy))).toEqual([
      '/questions/4/answer must be one of /questions/4/options',
    ]);
  });

  it('rejects_a_tag_not_in_the_taxonomy', () => {
    const meta = listeningMeta({ target_tags: [FIXTURE_TAGS.vocab, 'remote-work', 'vocab:colocation'] });
    expect(issuesOf(validateCuratedMeta('listening', meta, taxonomy))).toEqual([
      '/target_tags/1 "remote-work" is not in the error taxonomy (vfixture-1)',
      '/target_tags/2 "vocab:colocation" is not in the error taxonomy (vfixture-1)',
    ]);
  });

  it('accepts_tags_from_every_family_in_force', () => {
    const meta = listeningMeta({ target_tags: [FIXTURE_TAGS.grammar, FIXTURE_TAGS.vocab, FIXTURE_TAGS.discourse] });
    expect(validateCuratedMeta('listening', meta, taxonomy).ok).toBe(true);

    const withPhoneme = fixtureTaxonomyWith('phoneme:/θ/', 'phoneme');
    const ipa = listeningMeta({ target_tags: ['phoneme:/θ/'] });
    expect(validateCuratedMeta('listening', ipa, withPhoneme).ok).toBe(true);
    expect(validateCuratedMeta('listening', ipa, taxonomy).ok).toBe(false);
  });

  it('membership_applies_to_generated_input_too', () => {
    expect(issuesOf(validateGeneratedInput(generatedInput({ targetTags: ['remote-work'] }), taxonomy))).toEqual([
      '/targetTags/0 "remote-work" is not in the error taxonomy (vfixture-1)',
    ]);
  });
});
