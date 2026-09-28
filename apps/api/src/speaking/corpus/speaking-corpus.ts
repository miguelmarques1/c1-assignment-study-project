import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { normalizeToken } from '../../excerpts/excerpt-tokens';

/** Letters, apostrophes, spaces and the PRD's basic punctuation only — no digits, hyphens or symbols (spec A3). */
const ALLOWED_TEXT = /^[\p{L}\s'".,;:?!()—]*$/u;
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const readAloudFileSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, 'must be a lowercase slug'),
  text: z.string().min(1),
  drills: z.record(z.string(), z.array(z.string().min(1)).min(2).max(6)),
});

const openResponseFileSchema = z.strictObject({
  id: z.string().regex(ID_PATTERN, 'must be a lowercase slug'),
  prompt: z.string().min(1),
  hint: z.string().max(200).optional(),
  targets: z.array(z.string()).min(1).max(3),
});

const corpusFileSchema = z.strictObject({
  version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/, 'must be 1–32 letters, digits, dots, dashes or underscores'),
  read_aloud: z.array(readAloudFileSchema).min(1),
  open_response: z.array(openResponseFileSchema).min(1),
});

type CorpusFile = z.infer<typeof corpusFileSchema>;

export interface ReadAloudEntry {
  id: string;
  text: string;
  /** `phoneme:` tag to 2–6 example words drawn from `text`. */
  drills: Record<string, string[]>;
}

export interface OpenResponseEntry {
  id: string;
  prompt: string;
  hint: string | null;
  /** 1–3 analysis-family (grammar, vocab or discourse) target tags. */
  targets: string[];
}

export interface SpeakingCorpus {
  version: string;
  readAloud: ReadAloudEntry[];
  openResponse: OpenResponseEntry[];
}

export interface LoadedSpeakingCorpus extends SpeakingCorpus {
  fingerprint: string;
}

/** Minimal surface this module needs from the taxonomy, so it never depends on Nest. */
export interface TaxonomyLookup {
  has(tag: string): boolean;
  familyOf(tag: string): string | null;
  tagsInFamily(family: string): string[];
}

/** Thrown at boot when the corpus file is missing, unparsable or invalid. */
export class SpeakingCorpusValidationError extends Error {
  override readonly name = 'SpeakingCorpusValidationError';
  constructor(readonly issues: string[]) {
    super(`Invalid speaking corpus:\n  ${issues.join('\n  ')}`);
  }
}

/** The tokenizer the scorer uses (F09's `normalizeToken`), applied to raw corpus prose. */
export function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);
}

function toCorpus(file: CorpusFile): SpeakingCorpus {
  return {
    version: file.version,
    readAloud: file.read_aloud.map((entry) => ({ id: entry.id, text: entry.text, drills: entry.drills })),
    openResponse: file.open_response.map((entry) => ({
      id: entry.id,
      prompt: entry.prompt,
      hint: entry.hint ?? null,
      targets: entry.targets,
    })),
  };
}

/**
 * Structural rules Zod cannot express alone, plus everything that depends on
 * the taxonomy in force: ids unique across both lists, passages 25–60 words
 * of the allowed character set, every drill's tag a non-retired `phoneme:`
 * tag with words present in its own text, every prompt 8–60 words with
 * non-retired analysis-family targets, and full coverage — every phoneme tag
 * drilled by at least 2 passages, every discourse and vocab tag targeted by
 * at least 1 prompt.
 */
function semanticIssues(file: CorpusFile, taxonomy: TaxonomyLookup): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const phonemeCoverage = new Map(taxonomy.tagsInFamily('phoneme').map((tag) => [tag, 0]));
  const analysisTags = new Set([...taxonomy.tagsInFamily('discourse'), ...taxonomy.tagsInFamily('vocab')]);
  const analysisCoverage = new Map([...analysisTags].map((tag) => [tag, 0]));

  const checkId = (id: string, where: string): void => {
    if (seenIds.has(id)) {
      issues.push(`${where}: id "${id}" is listed twice`);
    }
    seenIds.add(id);
  };

  for (const entry of file.read_aloud) {
    checkId(entry.id, 'read_aloud');
    const collapsed = entry.text.replace(/\s+/g, ' ').trim();
    if (!ALLOWED_TEXT.test(collapsed)) {
      issues.push(`read_aloud.${entry.id}: text contains a character outside letters, apostrophes, spaces and basic punctuation`);
    }
    const words = wordsOf(entry.text);
    if (words.length < 25 || words.length > 60) {
      issues.push(`read_aloud.${entry.id}: ${words.length} words, must be 25–60`);
    }
    const tokenSet = new Set(words);

    for (const [tag, exampleWords] of Object.entries(entry.drills)) {
      if (!taxonomy.has(tag) || taxonomy.familyOf(tag) !== 'phoneme') {
        issues.push(`read_aloud.${entry.id}: "${tag}" is not a phoneme tag in the taxonomy in force`);
      } else {
        phonemeCoverage.set(tag, (phonemeCoverage.get(tag) ?? 0) + 1);
      }
      for (const word of exampleWords) {
        if (!tokenSet.has(normalizeToken(word))) {
          issues.push(`read_aloud.${entry.id}: "${tag}" example word "${word}" does not appear in its own text`);
        }
      }
    }
  }

  for (const entry of file.open_response) {
    checkId(entry.id, 'open_response');
    const words = wordsOf(entry.prompt);
    if (words.length < 8 || words.length > 60) {
      issues.push(`open_response.${entry.id}: ${words.length} words, must be 8–60`);
    }
    for (const tag of entry.targets) {
      const family = taxonomy.familyOf(tag);
      if (!taxonomy.has(tag) || family === 'phoneme') {
        issues.push(`open_response.${entry.id}: "${tag}" is not a non-retired analysis-family tag`);
      } else if (analysisCoverage.has(tag)) {
        analysisCoverage.set(tag, (analysisCoverage.get(tag) ?? 0) + 1);
      }
    }
  }

  for (const [tag, count] of phonemeCoverage) {
    if (count < 2) {
      issues.push(`coverage: phoneme tag "${tag}" is drilled by only ${count} passage(s), needs at least 2`);
    }
  }
  for (const [tag, count] of analysisCoverage) {
    if (count < 1) {
      issues.push(`coverage: tag "${tag}" is not targeted by any open-response prompt`);
    }
  }

  return issues;
}

/**
 * sha256 over every entry's own content, sorted by id so file reordering
 * never changes the fingerprint, with the version left out (as the error
 * taxonomy does): a passage or prompt changed under the same version fails
 * the pinned-fingerprint test, which is the point.
 */
export function corpusFingerprint(corpus: SpeakingCorpus): string {
  const canonical = JSON.stringify({
    readAloud: [...corpus.readAloud]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => [entry.id, entry.text, Object.entries(entry.drills).sort(([a], [b]) => a.localeCompare(b))]),
    openResponse: [...corpus.openResponse]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => [entry.id, entry.prompt, entry.hint, entry.targets]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Validates a parsed corpus file against the taxonomy in force. Never throws: every problem comes back in `issues`. */
export function parseSpeakingCorpus(
  raw: unknown,
  taxonomy: TaxonomyLookup,
): { corpus: SpeakingCorpus | null; issues: string[] } {
  const parsed = corpusFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      corpus: null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const issues = semanticIssues(parsed.data, taxonomy);
  if (issues.length > 0) {
    return { corpus: null, issues };
  }
  return { corpus: toCorpus(parsed.data), issues: [] };
}

/** Reads, parses and validates the corpus file; throws with every issue at once. */
export function loadSpeakingCorpus(filePath: string, taxonomy: TaxonomyLookup): LoadedSpeakingCorpus {
  const label = basename(filePath);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SpeakingCorpusValidationError([`${label}: could not be read or parsed — ${message}`]);
  }

  const { corpus, issues } = parseSpeakingCorpus(raw, taxonomy);
  if (!corpus) {
    throw new SpeakingCorpusValidationError(issues.map((issue) => `${label}: ${issue}`));
  }
  return { ...corpus, fingerprint: corpusFingerprint(corpus) };
}
