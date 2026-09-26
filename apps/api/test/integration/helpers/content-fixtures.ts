import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GeneratedItemInput } from '@english-quest/shared';

import {
  parseErrorTaxonomy,
  taxonomyFingerprint,
  type ErrorTaxonomy,
  type LoadedErrorTaxonomy,
} from '../../../src/taxonomy/error-taxonomy';

/**
 * Fixtures for the content bank (F13): valid items in every shape, a small
 * taxonomy so membership tests don't depend on the live file's contents,
 * generated WAV audio so no binary is committed, and a writer for item
 * folders in a temporary content root.
 */

export const FIXTURE_TAGS = {
  grammar: 'grammar:conditional-3',
  vocab: 'vocab:collocation',
  discourse: 'discourse:connector',
} as const;

function loaded(taxonomy: ErrorTaxonomy): LoadedErrorTaxonomy {
  return {
    ...taxonomy,
    fingerprint: taxonomyFingerprint(taxonomy),
    analysisTags: taxonomy.tags.map((tag) => tag.tag),
  };
}

/** Three families, one tag each, through F11's own parser. */
export function fixtureTaxonomy(version = 'fixture-1'): LoadedErrorTaxonomy {
  const { taxonomy, issues } = parseErrorTaxonomy({
    version,
    families: [
      { id: 'grammar', label: 'Grammar', analysis: true },
      { id: 'vocab', label: 'Vocabulary', analysis: true },
      { id: 'discourse', label: 'Discourse', analysis: true },
    ],
    tags: [
      { tag: FIXTURE_TAGS.grammar, label: 'Third conditional', family: 'grammar', description: 'x' },
      { tag: FIXTURE_TAGS.vocab, label: 'Collocation', family: 'vocab', description: 'x' },
      { tag: FIXTURE_TAGS.discourse, label: 'Connector', family: 'discourse', description: 'x' },
    ],
  });
  if (!taxonomy) {
    throw new Error(`fixture taxonomy failed to parse: ${issues.join('; ')}`);
  }
  return loaded(taxonomy);
}

/**
 * The fixture taxonomy plus an extra family, built directly rather than
 * through F11's parser, whose tag regex predates F12's `phoneme:/θ/` spelling.
 * Membership must accept whatever the taxonomy in force lists.
 */
export function fixtureTaxonomyWith(extraTag: string, family: string): LoadedErrorTaxonomy {
  const base = fixtureTaxonomy();
  return loaded({
    version: base.version,
    families: [...base.families, { id: family, label: family, analysis: false }],
    tags: [...base.tags, { tag: extraTag, label: extraTag, family, description: 'x' }].sort((a, b) =>
      a.tag.localeCompare(b.tag),
    ),
  });
}

export function multipleChoice(overrides: Record<string, unknown> = {}) {
  return {
    format: 'multiple_choice',
    prompt: "What is the presenter's main concern?",
    options: ['The cost of solar panels', 'Who bears the cost', 'Wind farm approvals', 'Consumer habits'],
    answer: 'Who bears the cost',
    explanation: 'He frames the programme around the distribution of costs.',
    ...overrides,
  };
}

export function fillBlank(overrides: Record<string, unknown> = {}) {
  return {
    format: 'fill_blank',
    prompt: 'The burden has been ___ onto households.',
    answer: ['shifted', 'offloaded'],
    explanation: "She says 'shifted onto households' at 04:12.",
    ...overrides,
  };
}

export function ordering(overrides: Record<string, unknown> = {}) {
  return {
    format: 'ordering',
    prompt: 'Put the arguments in the order they are made.',
    segments: ['Carbon taxes are regressive', 'Subsidies favour homeowners', 'Grid upgrades are unavoidable'],
    answer: [2, 0, 1],
    explanation: 'The grid point opens the debate.',
    ...overrides,
  };
}

export function matching(overrides: Record<string, unknown> = {}) {
  return {
    format: 'matching',
    prompt: 'Match each speaker to their position.',
    left: ['Economist', 'Minister', 'Campaigner'],
    right: ['Delay is costlier', 'Households need protection', 'The timetable is realistic'],
    answer: [1, 2, 0],
    explanation: 'The economist defends households.',
    ...overrides,
  };
}

/** Five valid questions, one of each format plus a second multiple choice. */
export function fiveQuestions(): Record<string, unknown>[] {
  return [
    multipleChoice(),
    fillBlank(),
    ordering(),
    matching(),
    multipleChoice({ prompt: "What does 'kick the can' mean?" }),
  ];
}

/** A valid `meta.json` for a listening item. Other types adjust `accent`, `skills` and `body`. */
export function listeningMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    $schema: '../meta.schema.json',
    title: 'Who pays for the energy transition?',
    cefr_level: 'C1',
    topic: 'climate policy',
    accent: 'british',
    skills: ['listening', 'vocabulary'],
    difficulty: 4,
    source: { name: 'BBC Radio 4', url: 'https://www.bbc.co.uk/programmes/example' },
    body: 'Presenter: Tonight we ask a question that most governments would rather avoid.',
    questions: fiveQuestions(),
    target_tags: [FIXTURE_TAGS.vocab, FIXTURE_TAGS.discourse],
    ...overrides,
  };
}

export function readingMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const { accent: _accent, ...meta } = listeningMeta({
    title: 'The Case Against Convenience',
    topic: 'technology ethics',
    skills: ['reading', 'grammar'],
    body: 'Had the first smart speakers shipped with a warning label, few would have bought one.',
    target_tags: [FIXTURE_TAGS.grammar],
  });
  return { ...meta, ...overrides };
}

export function vocabularyMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const { accent: _accent, body: _body, ...meta } = listeningMeta({
    title: 'Collocations of cost',
    topic: 'economics',
    skills: ['vocabulary'],
  });
  return { ...meta, ...overrides };
}

export function grammarMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const { accent: _accent, body: _body, ...meta } = listeningMeta({
    title: 'Third conditional drills',
    topic: 'regret',
    skills: ['grammar'],
    target_tags: [FIXTURE_TAGS.grammar],
  });
  return { ...meta, ...overrides };
}

/** A valid `saveGenerated` input (F14's side of the contract). */
export function generatedInput(overrides: Partial<Record<keyof GeneratedItemInput, unknown>> = {}): Record<string, unknown> {
  return {
    slug: 'gen-reading-7c1e2a',
    type: 'reading',
    cefrLevel: 'C1',
    title: 'The Case Against Convenience',
    topic: 'technology ethics',
    skills: ['reading', 'grammar'],
    difficulty: 4,
    body: 'Had the first smart speakers shipped with a warning label, few would have bought one.',
    questions: fiveQuestions(),
    targetTags: [FIXTURE_TAGS.grammar],
    promptId: 'reading-generate',
    promptVersion: '3',
    gateMetrics: { word_count: 612, mean_sentence_length: 21.4 },
    ...overrides,
  };
}

/**
 * `seconds` of 8 kHz mono 16-bit PCM silence with a valid RIFF header: ffmpeg
 * decodes it to a real duration, and no audio binary is committed.
 */
export function makeWav(seconds: number): Buffer {
  const sampleRate = 8000;
  const bytesPerSample = 2;
  const dataSize = Math.round(seconds * sampleRate) * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

export interface ContentRoot {
  root: string;
  /** Writes `<root>/<type>/<slug>/meta.json` (an object is serialized, a string written as-is) plus any extra files. */
  writeItem: (
    type: string,
    slug: string,
    meta: Record<string, unknown> | string | null,
    files?: Record<string, Buffer | string>,
  ) => Promise<string>;
  removeItem: (type: string, slug: string) => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function createContentRoot(): Promise<ContentRoot> {
  const root = await mkdtemp(join(tmpdir(), 'eq-content-'));
  return {
    root,
    writeItem: async (type, slug, meta, files = {}) => {
      const folder = join(root, type, slug);
      await mkdir(folder, { recursive: true });
      if (meta !== null) {
        const body = typeof meta === 'string' ? meta : JSON.stringify(meta, null, 2);
        await writeFile(join(folder, 'meta.json'), body, 'utf-8');
      }
      for (const [name, content] of Object.entries(files)) {
        await writeFile(join(folder, name), content);
      }
      return folder;
    },
    removeItem: async (type, slug) => {
      await rm(join(root, type, slug), { recursive: true, force: true });
    },
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
