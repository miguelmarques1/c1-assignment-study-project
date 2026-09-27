import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { questionFormatSchema, type GeneratedContentType, type QuestionFormat } from '@english-quest/shared';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type { LoadedErrorTaxonomy } from '../../taxonomy/error-taxonomy';
import { MAX_ITEMS_PER_RUN } from '../generation.constants';
import { normalizeForMatch } from '../text/text-metrics';

/** The order slots are allocated in, round-robin (spec A9). */
export const GENERATED_ITEM_TYPES = ['reading', 'grammar', 'vocabulary', 'error_review'] as const satisfies readonly GeneratedContentType[];

/** The PRD's list of ten, as a rule: a rules file with another count is a mistake, not a tuning. */
const GENRE_COUNT = 10;
/** Width of `content_generation_slots.genre`. */
const GENRE_MAX_LENGTH = 40;

const positiveInt = z.number().int().positive();
const share = z.number().gt(0).max(1);
const range = <T extends z.ZodType<number>>(bound: T) => z.strictObject({ min: bound, max: bound });

const itemTypeSchema = z.strictObject({
  words: range(positiveInt),
  mean_sentence_length: range(z.number().positive()),
  min_type_token_ratio: share,
  min_out_of_frequency_ratio: share,
  min_structure_occurrences: positiveInt,
  target_tags: range(z.number().int().min(1).max(2)),
  difficulty: z.number().int().min(1).max(5),
});

const lexiconName = /^[a-z_]+$/;

const rulesFileSchema = z.strictObject({
  version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/, 'must be 1–32 letters, digits, dots, dashes or underscores'),
  frequency_rank_cutoff: z.number().int().min(1000).max(5000),
  min_occurrence_thirds: z.number().int().min(1).max(3),
  learner_quote_run_words: z.number().int().min(3),
  questions: z.strictObject({
    count: z.literal(5),
    formats: z.array(questionFormatSchema).min(1),
  }),
  item_types: z.strictObject({
    reading: itemTypeSchema,
    vocabulary: itemTypeSchema,
    grammar: itemTypeSchema,
    error_review: itemTypeSchema,
  }),
  batch: z.strictObject({
    mix: z.strictObject({
      reading: z.number().int().min(0),
      grammar: z.number().int().min(0),
      vocabulary: z.number().int().min(0),
      error_review: z.number().int().min(0),
    }),
    max_items_per_tag: positiveInt,
  }),
  genres: z.array(z.string().min(1).max(GENRE_MAX_LENGTH)),
  banned_phrases: z.array(z.string().min(1)).min(1),
  lexicons: z.record(z.string().regex(lexiconName), z.array(z.string().min(1)).min(1)),
  structure_markers: z.record(z.string().min(1), z.array(z.string().min(1)).min(1)),
});

type RulesFile = z.infer<typeof rulesFileSchema>;

export interface ItemTypeRules {
  words: { min: number; max: number };
  meanSentenceLength: { min: number; max: number };
  minTypeTokenRatio: number;
  minOutOfFrequencyRatio: number;
  minStructureOccurrences: number;
  targetTags: { min: number; max: number };
  difficulty: number;
}

export interface GenerationRules {
  frequencyRankCutoff: number;
  minOccurrenceThirds: number;
  learnerQuoteRunWords: number;
  questions: { count: number; formats: QuestionFormat[] };
  itemTypes: Record<GeneratedContentType, ItemTypeRules>;
  batch: { mix: Record<GeneratedContentType, number>; maxItemsPerTag: number };
  genres: string[];
  /** Sorted; normalised the way the gate normalises text. */
  bannedPhrases: string[];
  /** Words sorted within each lexicon. */
  lexicons: Record<string, string[]>;
  /** The patterns as written, `{name}` references unexpanded. */
  structureMarkers: Record<string, string[]>;
}

export interface LoadedGenerationRules {
  version: string;
  fingerprint: string;
  rules: GenerationRules;
  /** Tag → compiled markers, lexicons expanded, case-insensitive. */
  markers: ReadonlyMap<string, RegExp[]>;
}

/** Thrown at boot when the rules file is missing, unparsable or invalid. */
export class GenerationRulesValidationError extends Error {
  override readonly name = 'GenerationRulesValidationError';
  constructor(readonly issues: string[]) {
    super(`Invalid content generation rules:\n  ${issues.join('\n  ')}`);
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A lexicon as an alternation: longest entries first, so `ought to` wins over a shorter prefix; spaces match any whitespace. */
function lexiconAlternation(entries: readonly string[]): string {
  return [...entries]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
    .map((entry) => escapeRegExp(entry).replace(/ +/g, '\\s+'))
    .join('|');
}

/** Expands `{name}` references; returns the unknown names instead when there are any. */
export function expandMarker(pattern: string, lexicons: Readonly<Record<string, string[]>>): { source: string; unknown: string[] } {
  const unknown: string[] = [];
  const source = pattern.replace(/\{([a-z_]+)\}/g, (match, name: string) => {
    const entries = lexicons[name];
    if (!entries) {
      unknown.push(name);
      return match;
    }
    return lexiconAlternation(entries);
  });
  return { source, unknown };
}

function toRules(file: RulesFile): GenerationRules {
  const itemType = (entry: RulesFile['item_types']['reading']): ItemTypeRules => ({
    words: entry.words,
    meanSentenceLength: entry.mean_sentence_length,
    minTypeTokenRatio: entry.min_type_token_ratio,
    minOutOfFrequencyRatio: entry.min_out_of_frequency_ratio,
    minStructureOccurrences: entry.min_structure_occurrences,
    targetTags: entry.target_tags,
    difficulty: entry.difficulty,
  });
  return {
    frequencyRankCutoff: file.frequency_rank_cutoff,
    minOccurrenceThirds: file.min_occurrence_thirds,
    learnerQuoteRunWords: file.learner_quote_run_words,
    questions: { count: file.questions.count, formats: file.questions.formats },
    itemTypes: {
      reading: itemType(file.item_types.reading),
      vocabulary: itemType(file.item_types.vocabulary),
      grammar: itemType(file.item_types.grammar),
      error_review: itemType(file.item_types.error_review),
    },
    batch: { mix: file.batch.mix, maxItemsPerTag: file.batch.max_items_per_tag },
    genres: file.genres,
    bannedPhrases: [...file.banned_phrases].sort(),
    lexicons: Object.fromEntries(
      Object.entries(file.lexicons).map(([name, entries]) => [name, [...entries].sort()]),
    ),
    structureMarkers: file.structure_markers,
  };
}

/** Rules that parse but contradict themselves, the PRD, or the taxonomy in force. */
function semanticIssues(file: RulesFile, taxonomy: LoadedErrorTaxonomy): string[] {
  const issues: string[] = [];

  for (const [type, entry] of Object.entries(file.item_types)) {
    if (entry.words.min >= entry.words.max) {
      issues.push(`item_types.${type}.words.min: must be below words.max`);
    }
    if (entry.mean_sentence_length.min >= entry.mean_sentence_length.max) {
      issues.push(`item_types.${type}.mean_sentence_length.min: must be below mean_sentence_length.max`);
    }
    if (entry.target_tags.min > entry.target_tags.max) {
      issues.push(`item_types.${type}.target_tags.min: must not exceed target_tags.max`);
    }
  }

  if (new Set(file.questions.formats).size !== file.questions.formats.length) {
    issues.push('questions.formats: lists a format twice');
  }

  const mixTotal = Object.values(file.batch.mix).reduce((sum, count) => sum + count, 0);
  if (mixTotal < 1 || mixTotal > MAX_ITEMS_PER_RUN) {
    issues.push(`batch.mix: must plan between 1 and ${MAX_ITEMS_PER_RUN} items (PRD: capped at 12 per run), got ${mixTotal}`);
  }

  if (file.genres.length !== GENRE_COUNT) {
    issues.push(`genres: the PRD's rotating list has exactly ${GENRE_COUNT} genres, got ${file.genres.length}`);
  }
  const seenGenres = new Set<string>();
  file.genres.forEach((genre, index) => {
    if (seenGenres.has(genre)) {
      issues.push(`genres.${index}: "${genre}" is listed twice`);
    }
    seenGenres.add(genre);
  });

  const seenPhrases = new Set<string>();
  file.banned_phrases.forEach((phrase, index) => {
    if (normalizeForMatch(phrase) !== phrase) {
      issues.push(`banned_phrases.${index}: "${phrase}" is not normalised (lowercase, straight apostrophes, single spaces)`);
    }
    if (seenPhrases.has(phrase)) {
      issues.push(`banned_phrases.${index}: "${phrase}" is listed twice`);
    }
    seenPhrases.add(phrase);
  });

  for (const [tag, patterns] of Object.entries(file.structure_markers)) {
    const family = taxonomy.familyOf.get(tag);
    if (!family) {
      issues.push(`structure_markers.${tag}: not a tag in the error taxonomy (v${taxonomy.version})`);
      continue;
    }
    if (!taxonomy.families.find((entry) => entry.id === family)?.analysis) {
      issues.push(`structure_markers.${tag}: ${family} tags are never generation targets`);
      continue;
    }
    patterns.forEach((pattern, index) => {
      const { source, unknown } = expandMarker(pattern, file.lexicons);
      if (unknown.length > 0) {
        issues.push(`structure_markers.${tag}.${index}: unknown lexicon ${unknown.map((name) => `{${name}}`).join(', ')}`);
        return;
      }
      try {
        new RegExp(source, 'iu');
      } catch (error) {
        issues.push(`structure_markers.${tag}.${index}: does not compile — ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  return issues;
}

/**
 * sha256 over every value in a fixed key order, with order-free lists
 * sorted and the version left out: two versions with identical rules share
 * a fingerprint, and a value changed under the same version does not.
 */
export function rulesFingerprint(rules: GenerationRules): string {
  const markers = Object.keys(rules.structureMarkers)
    .sort()
    .map((tag) => [tag, [...(rules.structureMarkers[tag] ?? [])].sort()]);
  const itemTypes = GENERATED_ITEM_TYPES.map((type) => {
    const entry = rules.itemTypes[type];
    return [
      type,
      entry.words.min,
      entry.words.max,
      entry.meanSentenceLength.min,
      entry.meanSentenceLength.max,
      entry.minTypeTokenRatio,
      entry.minOutOfFrequencyRatio,
      entry.minStructureOccurrences,
      entry.targetTags.min,
      entry.targetTags.max,
      entry.difficulty,
    ];
  });
  const canonical = JSON.stringify({
    cutoff: rules.frequencyRankCutoff,
    thirds: rules.minOccurrenceThirds,
    quoteRun: rules.learnerQuoteRunWords,
    questions: [rules.questions.count, [...rules.questions.formats].sort()],
    itemTypes,
    mix: GENERATED_ITEM_TYPES.map((type) => rules.batch.mix[type]),
    maxPerTag: rules.batch.maxItemsPerTag,
    genres: [...rules.genres].sort(),
    banned: rules.bannedPhrases,
    lexicons: Object.keys(rules.lexicons)
      .sort()
      .map((name) => [name, rules.lexicons[name]]),
    markers,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function compileMarkers(rules: GenerationRules): Map<string, RegExp[]> {
  const compiled = new Map<string, RegExp[]>();
  for (const [tag, patterns] of Object.entries(rules.structureMarkers)) {
    compiled.set(
      tag,
      patterns.map((pattern) => new RegExp(expandMarker(pattern, rules.lexicons).source, 'iu')),
    );
  }
  return compiled;
}

/** Validates a parsed rules file against the taxonomy in force. Never throws: every problem comes back in `issues`. */
export function parseGenerationRules(
  raw: unknown,
  taxonomy: LoadedErrorTaxonomy,
): { rules: GenerationRules | null; issues: string[] } {
  const parsed = rulesFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      rules: null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const issues = semanticIssues(parsed.data, taxonomy);
  if (issues.length > 0) {
    return { rules: null, issues };
  }
  return { rules: toRules(parsed.data), issues: [] };
}

export function loadedRules(version: string, rules: GenerationRules): LoadedGenerationRules {
  return { version, fingerprint: rulesFingerprint(rules), rules, markers: compileMarkers(rules) };
}

/** Reads, parses and validates the rules file; throws with every issue at once. */
export function loadGenerationRulesFile(filePath: string, taxonomy: LoadedErrorTaxonomy): LoadedGenerationRules {
  const label = basename(filePath);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GenerationRulesValidationError([`${label}: could not be read or parsed — ${message}`]);
  }

  const { rules, issues } = parseGenerationRules(raw, taxonomy);
  if (!rules) {
    throw new GenerationRulesValidationError(issues.map((issue) => `${label}: ${issue}`));
  }
  return loadedRules((raw as { version: string }).version, rules);
}
