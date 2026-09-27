import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { cefrLevelSchema, type CefrLevel } from '@english-quest/shared';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const positiveInt = z.number().int().positive();
const share = z.number().gt(0).max(1);
const dayNumber = z.number().int().min(1).max(7);
const range = <T extends z.ZodType<number>>(bound: T) => z.strictObject({ min: bound, max: bound });

/** A task slot: how many, which days they land on, and the target-tag count they carry (spec A9, A11). */
const taskRuleSchema = z.strictObject({
  count: positiveInt,
  days: z.array(dayNumber).min(1),
  tags: range(z.number().int().min(1).max(5)),
});

const rulesFileSchema = z.strictObject({
  version: z.string().regex(/^[0-9A-Za-z._-]{1,32}$/, 'must be 1–32 letters, digits, dots, dashes or underscores'),
  sessions: z.strictObject({
    count: z.literal(7),
    activities: range(z.number().int().min(1)),
    minutes: range(positiveInt),
  }),
  estimates: z.strictObject({
    words_per_minute: positiveInt,
    question_minutes: z.number().int().nonnegative(),
    listening_passes: positiveInt,
    fallback_minutes: z.strictObject({ listening: positiveInt, reading: positiveInt }),
    fixed_minutes: z.strictObject({
      vocabulary: positiveInt,
      grammar: positiveInt,
      error_review: positiveInt,
      writing: positiveInt,
      speaking: positiveInt,
      pronunciation: positiveInt,
    }),
  }),
  quotas: z.strictObject({
    minimum: z.strictObject({ listening: z.number().int().min(1), reading: z.number().int().min(1) }),
    review_max_share: share,
  }),
  tasks: z.strictObject({
    writing: taskRuleSchema,
    pronunciation: taskRuleSchema,
    speaking: taskRuleSchema,
    speaking_without_pronunciation: z.strictObject({
      count: positiveInt,
      days: z.array(dayNumber).min(1),
    }),
    filler: z.array(z.enum(['speaking', 'pronunciation'])).min(1),
  }),
  carry_over: z.strictObject({ max: z.number().int().min(0) }),
  candidates: z.strictObject({
    /** Preference order, not a set: index 0 is tried first (spec A7). */
    cefr_levels: z.array(cefrLevelSchema).min(1),
    offered_per_type: z.strictObject({
      listening: positiveInt,
      reading: positiveInt,
      vocabulary: positiveInt,
      grammar: positiveInt,
      error_review: positiveInt,
    }),
    offered_max: positiveInt,
    max_per_primary_tag: positiveInt,
  }),
  model: z.strictObject({
    selections: range(positiveInt),
    invalid_share_to_discard: share,
    rationale_chars: range(positiveInt),
  }),
  generation: z.strictObject({ max_items: z.number().int().min(1).max(12) }),
});

type RulesFile = z.infer<typeof rulesFileSchema>;

export interface TaskRule {
  count: number;
  days: number[];
  tags: { min: number; max: number };
}

export interface StudyPlanRules {
  sessions: { count: number; activities: { min: number; max: number }; minutes: { min: number; max: number } };
  estimates: {
    wordsPerMinute: number;
    questionMinutes: number;
    listeningPasses: number;
    fallbackMinutes: { listening: number; reading: number };
    fixedMinutes: {
      vocabulary: number;
      grammar: number;
      error_review: number;
      writing: number;
      speaking: number;
      pronunciation: number;
    };
  };
  quotas: { minimum: { listening: number; reading: number }; reviewMaxShare: number };
  tasks: {
    writing: TaskRule;
    pronunciation: TaskRule;
    speaking: TaskRule;
    speakingWithoutPronunciation: { count: number; days: number[] };
    filler: Array<'speaking' | 'pronunciation'>;
  };
  carryOver: { max: number };
  candidates: {
    cefrLevels: CefrLevel[];
    offeredPerType: {
      listening: number;
      reading: number;
      vocabulary: number;
      grammar: number;
      error_review: number;
    };
    offeredMax: number;
    maxPerPrimaryTag: number;
  };
  model: { selections: { min: number; max: number }; invalidShareToDiscard: number; rationaleChars: { min: number; max: number } };
  generation: { maxItems: number };
}

export interface LoadedPlanRules {
  version: string;
  fingerprint: string;
  rules: StudyPlanRules;
}

/** Thrown at boot when the rules file is missing, unparsable or invalid. */
export class PlanRulesValidationError extends Error {
  override readonly name = 'PlanRulesValidationError';
  constructor(readonly issues: string[]) {
    super(`Invalid study plan rules:\n  ${issues.join('\n  ')}`);
  }
}

function toRules(file: RulesFile): StudyPlanRules {
  const task = (entry: RulesFile['tasks']['writing']): TaskRule => ({
    count: entry.count,
    days: entry.days,
    tags: entry.tags,
  });
  return {
    sessions: file.sessions,
    estimates: {
      wordsPerMinute: file.estimates.words_per_minute,
      questionMinutes: file.estimates.question_minutes,
      listeningPasses: file.estimates.listening_passes,
      fallbackMinutes: file.estimates.fallback_minutes,
      fixedMinutes: file.estimates.fixed_minutes,
    },
    quotas: { minimum: file.quotas.minimum, reviewMaxShare: file.quotas.review_max_share },
    tasks: {
      writing: task(file.tasks.writing),
      pronunciation: task(file.tasks.pronunciation),
      speaking: task(file.tasks.speaking),
      speakingWithoutPronunciation: file.tasks.speaking_without_pronunciation,
      filler: file.tasks.filler,
    },
    carryOver: file.carry_over,
    candidates: {
      cefrLevels: file.candidates.cefr_levels,
      offeredPerType: file.candidates.offered_per_type,
      offeredMax: file.candidates.offered_max,
      maxPerPrimaryTag: file.candidates.max_per_primary_tag,
    },
    model: {
      selections: file.model.selections,
      invalidShareToDiscard: file.model.invalid_share_to_discard,
      rationaleChars: file.model.rationale_chars,
    },
    generation: { maxItems: file.generation.max_items },
  };
}

/** Rules that parse but contradict themselves or the session shape they describe. */
function semanticIssues(file: RulesFile): string[] {
  const issues: string[] = [];

  if (file.sessions.activities.min >= file.sessions.activities.max) {
    issues.push('sessions.activities.min: must be below activities.max');
  }
  if (file.sessions.minutes.min >= file.sessions.minutes.max) {
    issues.push('sessions.minutes.min: must be below minutes.max');
  }

  const checkTask = (name: string, entry: RulesFile['tasks']['writing']): void => {
    if (entry.days.length !== entry.count) {
      issues.push(`tasks.${name}.days: must list exactly ${entry.count} day(s) to match count, got ${entry.days.length}`);
    }
    if (new Set(entry.days).size !== entry.days.length) {
      issues.push(`tasks.${name}.days: lists a day twice`);
    }
    if (entry.tags.min > entry.tags.max) {
      issues.push(`tasks.${name}.tags.min: must not exceed tags.max`);
    }
  };
  checkTask('writing', file.tasks.writing);
  checkTask('pronunciation', file.tasks.pronunciation);
  checkTask('speaking', file.tasks.speaking);

  const swp = file.tasks.speaking_without_pronunciation;
  if (swp.days.length !== swp.count) {
    issues.push(`tasks.speaking_without_pronunciation.days: must list exactly ${swp.count} day(s) to match count, got ${swp.days.length}`);
  }
  if (new Set(swp.days).size !== swp.days.length) {
    issues.push('tasks.speaking_without_pronunciation.days: lists a day twice');
  }

  const seenLevels = new Set<string>();
  file.candidates.cefr_levels.forEach((level, index) => {
    if (seenLevels.has(level)) {
      issues.push(`candidates.cefr_levels.${index}: "${level}" is listed twice`);
    }
    seenLevels.add(level);
  });

  if (file.model.selections.min > file.model.selections.max) {
    issues.push('model.selections.min: must not exceed selections.max');
  }
  if (file.model.rationale_chars.min > file.model.rationale_chars.max) {
    issues.push('model.rationale_chars.min: must not exceed rationale_chars.max');
  }

  return issues;
}

/**
 * sha256 over every value in a fixed key order, so two versions with
 * identical rules share a fingerprint and a value changed under the same
 * version does not. Arrays here are all semantically ordered (a CEFR
 * preference, a filler alternation, a task's days), so none are sorted.
 */
export function rulesFingerprint(rules: StudyPlanRules): string {
  const canonical = JSON.stringify({
    sessions: rules.sessions,
    estimates: rules.estimates,
    quotas: rules.quotas,
    tasks: rules.tasks,
    carryOver: rules.carryOver,
    candidates: rules.candidates,
    model: rules.model,
    generation: rules.generation,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Validates a parsed rules file. Never throws: every problem comes back in `issues`. */
export function parsePlanRules(raw: unknown): { rules: StudyPlanRules | null; issues: string[] } {
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

export function loadedRules(version: string, rules: StudyPlanRules): LoadedPlanRules {
  return { version, fingerprint: rulesFingerprint(rules), rules };
}

/** Reads, parses and validates the rules file; throws with every issue at once. */
export function loadPlanRulesFile(filePath: string): LoadedPlanRules {
  const label = basename(filePath);
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PlanRulesValidationError([`${label}: could not be read or parsed — ${message}`]);
  }

  const { rules, issues } = parsePlanRules(raw);
  if (!rules) {
    throw new PlanRulesValidationError(issues.map((issue) => `${label}: ${issue}`));
  }
  return loadedRules((raw as { version: string }).version, rules);
}
