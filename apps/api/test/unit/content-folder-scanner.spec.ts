import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseContentFilter, scanContentRoot } from '../../src/content/import/folder-scanner';
import { createContentRoot, listeningMeta, readingMeta, type ContentRoot } from '../integration/helpers/content-fixtures';

describe('content folder scanner', () => {
  let content: ContentRoot;

  beforeEach(async () => {
    content = await createContentRoot();
  });

  afterEach(async () => {
    await content.cleanup();
  });

  it('derives_type_and_slug_from_the_folder_layout', async () => {
    await content.writeItem('listening', 'bbc-climate-debate', listeningMeta(), { 'audio.mp3': 'x' });
    const [item, ...rest] = await scanContentRoot(content.root);
    expect(rest).toEqual([]);
    expect(item).toMatchObject({
      typeFolder: 'listening',
      importableType: 'listening',
      slug: 'bbc-climate-debate',
      label: 'bbc-climate-debate',
      problem: null,
    });
    expect(item!.metaPath).toBe(join(content.root, 'listening', 'bbc-climate-debate', 'meta.json'));
  });

  it('reports_items_under_an_unknown_type_folder', async () => {
    await content.writeItem('listenning', 'foo', listeningMeta());
    await content.writeItem('listenning', 'bar', listeningMeta());
    const items = await scanContentRoot(content.root);
    expect(items.map((item) => [item.label, item.problem])).toEqual([
      ['listenning/bar', 'unknown content type folder "listenning"'],
      ['listenning/foo', 'unknown content type folder "listenning"'],
    ]);
  });

  it('rejects_folder_names_that_are_not_slugs', async () => {
    await content.writeItem('reading', 'BBC Debate', readingMeta());
    await content.writeItem('reading', 'foo_bar', readingMeta());
    await content.writeItem('reading', 'fine-slug', readingMeta());
    const items = await scanContentRoot(content.root);
    const problems = Object.fromEntries(items.map((item) => [item.slug, item.problem]));
    expect(problems['BBC Debate']).toMatch(/^folder name "BBC Debate" is not a valid slug/);
    expect(problems.foo_bar).toMatch(/^folder name "foo_bar" is not a valid slug/);
    expect(problems['fine-slug']).toBeNull();
  });

  it('flags_a_missing_meta_json', async () => {
    await content.writeItem('listening', 'no-meta', null, { 'audio.mp3': 'x' });
    const [item] = await scanContentRoot(content.root);
    expect(item).toMatchObject({ metaPath: null, problem: 'meta.json not found in folder' });
  });

  it('applies_type_and_slug_filters', async () => {
    await content.writeItem('listening', 'one', listeningMeta());
    await content.writeItem('listening', 'two', listeningMeta());
    await content.writeItem('reading', 'three', readingMeta());

    const byType = await scanContentRoot(content.root, parseContentFilter('listening'));
    expect(byType.map((item) => item.slug)).toEqual(['one', 'two']);

    const bySlug = await scanContentRoot(content.root, parseContentFilter('listening/two'));
    expect(bySlug.map((item) => item.slug)).toEqual(['two']);

    expect(await scanContentRoot(content.root, parseContentFilter('grammar'))).toEqual([]);
    expect(() => parseContentFilter('listening/a/b')).toThrow(/is not a filter/);
  });

  it('classifies_audio_by_extension_case_insensitively', async () => {
    await content.writeItem('listening', 'mixed', listeningMeta(), {
      'AUDIO.MP3': 'x',
      'notes.txt': 'x',
      'draft.json': '{}',
    });
    const [item] = await scanContentRoot(content.root);
    expect(item!.audioFiles.map((file) => basename(file))).toEqual(['AUDIO.MP3']);
  });

  it('ignores_top_level_files_and_meta_schema_json', async () => {
    await content.writeItem('listening', 'only-item', listeningMeta());
    await writeFile(join(content.root, 'README.md'), '# notes');
    await writeFile(join(content.root, 'listening', 'meta.schema.json'), '{}');
    const items = await scanContentRoot(content.root);
    expect(items.map((item) => item.slug)).toEqual(['only-item']);
  });
});
