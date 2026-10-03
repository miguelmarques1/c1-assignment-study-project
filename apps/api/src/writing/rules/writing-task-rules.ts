import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { countWords } from '@english-quest/shared';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const rulesFileSchema = z.strictObject({
  version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/, 'must be 1–32 letters, digits, dots, dashes or underscores'),
  statement_words: z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() }),
  tags_per_task: z.strictObject({ max: z.union([z.literal(1), z.literal(2)]) }),
  scenario_no_repeat_within: z.number().int().nonnegative(),
  closing: z.string().min(1),
  general_requirement: z.string().min(1),
  scenarios: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case'),
        heading: z.string().min(1).max(80),
        text: z.string().min(1),
      }),
    )
    .min(1),
  requirements: z.record(z.string(), z.string().min(1)),
});

type RulesFile = z.infer<typeof rulesFileSchema>;

export interface WritingTaskScenario {
  id: string;
  heading: string;
  text: string;
}

export interface WritingTaskRules {
  statementWords: { min: number; max: number };
  tagsPerTaskMax: 1 | 2;
  scenarioNoRepeatWithin: number;
  closing: string;
  generalRequirement: string;
  scenarios: WritingTaskScenario[];
  /** Keyed by analysis tag, checked against the taxonomy in force by the service, not here. */
  requirements: Record<string, string>;
}

export interface LoadedWritingTaskRules {
  version: string;
  fingerprint: string;
  rules: WritingTaskRules;
}

/** Thrown at boot when the rules file is missing, unparsable, self-contradictory, or disagrees with the taxonomy. */
export class WritingTaskRulesValidationError extends Error {
  override readonly name = 'WritingTaskRulesValidationError';
  constructor(readonly issues: string[]) {
    super(`Invalid writing task rules:\n  ${issues.join('\n  ')}`);
  }
}

function toRules(file: RulesFile): WritingTaskRules {
  return {
    statementWords: file.statement_words,
    tagsPerTaskMax: file.tags_per_task.max,
    scenarioNoRepeatWithin: file.scenario_no_repeat_within,
    closing: file.closing,
    generalRequirement: file.general_requirement,
    scenarios: file.scenarios,
    requirements: file.requirements,
  };
}

/**
 * Rules that parse but contradict themselves or the 80–150 word range they
 * promise (spec §5 "Invariants"). Every check here is self-contained: no
 * taxonomy is needed, only the file's own scenarios and requirements.
 */
function semanticIssues(file: RulesFile): string[] {
  const issues: string[] = [];

  if (file.statement_words.min > file.statement_words.max) {
    issues.push('statement_words.min: must not exceed statement_words.max');
  }

  const seenIds = new Set<string>();
  file.scenarios.forEach((scenario, index) => {
    if (seenIds.has(scenario.id)) {
      issues.push(`scenarios.${index}.id: "${scenario.id}" is listed twice`);
    }
    seenIds.add(scenario.id);
  });
  const minScenarios = file.scenario_no_repeat_within + 1;
  if (file.scenarios.length < minScenarios) {
    issues.push(`scenarios: needs at least ${minScenarios} (scenario_no_repeat_within + 1), got ${file.scenarios.length}`);
  }

  const texts: Array<[string, string]> = [
    ['closing', file.closing],
    ['general_requirement', file.general_requirement],
    ...file.scenarios.map((scenario): [string, string] => [`scenarios.${scenario.id}.text`, scenario.text]),
    ...Object.entries(file.requirements).map(([tag, text]): [string, string] => [`requirements.${tag}`, text]),
  ];
  for (const [path, text] of texts) {
    if (text.includes('{{')) {
      issues.push(`${path}: must not contain "{{"`);
    }
  }

  const requirementWords = Object.entries(file.requirements).map(([tag, text]) => ({ tag, words: countWords(text) }));
  if (requirementWords.length === 0) {
    // Nothing more to check without at least one requirement; already reported by the schema (min(1) on the record
    // would allow an empty object, so this keeps the boot check honest without a stricter schema shape).
    issues.push('requirements: must declare at least one requirement');
    return issues;
  }
  const closingWords = countWords(file.closing);
  const generalWords = countWords(file.general_requirement);
  const sortedByWords = [...requirementWords].sort((a, b) => a.words - b.words);
  const shortest = sortedByWords[0]!;
  const longestCombo = sortedByWords.slice(-file.tags_per_task.max);
  const longestComboWords = longestCombo.reduce((sum, entry) => sum + entry.words, 0);

  for (const scenario of file.scenarios) {
    const scenarioWords = countWords(scenario.text);
    const minCase = scenarioWords + closingWords + shortest.words;
    const maxCase = scenarioWords + closingWords + longestComboWords;
    const generalCase = scenarioWords + closingWords + generalWords;
    if (minCase < file.statement_words.min) {
      issues.push(
        `scenarios.${scenario.id}: with its shortest requirement ("${shortest.tag}") and the closing, composes to ` +
          `${minCase} words, under the ${file.statement_words.min}-word minimum`,
      );
    }
    if (maxCase > file.statement_words.max) {
      issues.push(
        `scenarios.${scenario.id}: with its ${file.tags_per_task.max} longest requirement(s) and the closing, composes to ` +
          `${maxCase} words, over the ${file.statement_words.max}-word maximum`,
      );
    }
    if (generalCase < file.statement_words.min || generalCase > file.statement_words.max) {
      issues.push(
        `scenarios.${scenario.id}: with the general requirement and the closing, composes to ${generalCase} words, ` +
          `outside ${file.statement_words.min}–${file.statement_words.max}`,
      );
    }
  }

  return issues;
}

/**
 * sha256 over every value in a fixed key order, so two versions with
 * identical rules share a fingerprint and a value changed under the same
 * version does not. `requirements` is sorted by tag so key order in the YAML
 * never matters.
 */
export function writingTaskRulesFingerprint(rules: WritingTaskRules): string {
  const canonical = JSON.stringify({
    statementWords: rules.statementWords,
    tagsPerTaskMax: rules.tagsPerTaskMax,
    scenarioNoRepeatWithin: rules.scenarioNoRepeatWithin,
    closing: rules.closing,
    generalRequirement: rules.generalRequirement,
    scenarios: rules.scenarios,
    requirements: Object.fromEntries(Object.entries(rules.requirements).sort(([a], [b]) => a.localeCompare(b))),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Validates a parsed rules file. Never throws: every problem comes back in `issues`. */
export function parseWritingTaskRules(raw: unknown): { rules: WritingTaskRules | null; issues: string[] } {
  const parsed = rulesFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      rules: null,
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    };
  }
  const issues = semanticIssues(parsed.data);
  if (issues.length > 0) {
    return { rules: null, issues };
  }
  return { rules: toRules(parsed.data), issues: [] };
}

/**
 * The taxonomy-dependent half of validation (spec §5 "Invariants": "the
 * requirement keys equal the taxonomy's analysis tags"), kept separate from
 * `parseWritingTaskRules` because only the service has the taxonomy in
 * force. Returns every extra and every missing tag, named individually.
 */
export function checkRequirementsCoverage(rules: WritingTaskRules, analysisTags: readonly string[]): string[] {
  const issues: string[] = [];
  const declared = new Set(Object.keys(rules.requirements));
  const expected = new Set(analysisTags);
  for (const tag of expected) {
    if (!declared.has(tag)) {
      issues.push(`requirements: missing a requirement for analysis tag "${tag}"`);
    }
  }
  for (const tag of declared) {
    if (!expected.has(tag)) {
      issues.push(`requirements: "${tag}" is not an analysis tag in the taxonomy in force`);
    }
  }
  return issues;
}

/** Reads, parses and validates the rules file; throws with every issue at once. */
export function loadWritingTaskRulesFile(filePath: string): LoadedWritingTaskRules {
  const label = basename(filePath);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WritingTaskRulesValidationError([`${label}: could not be read or parsed — ${message}`]);
  }

  const { rules, issues } = parseWritingTaskRules(raw);
  if (!rules) {
    throw new WritingTaskRulesValidationError(issues.map((issue) => `${label}: ${issue}`));
  }
  return { version: (raw as { version: string }).version, fingerprint: writingTaskRulesFingerprint(rules), rules };
}
