import type { AnalysisCompetency, ErrorSeverity, Register, ScenarioContext } from '@english-quest/shared';

import { ANALYSIS_LONG_LESSON_SECONDS } from './analysis.constants';

/** The owner's own utterance, exactly as stored — what every quote is matched against. Never another participant's. */
export interface OwnUtterance {
  id: string;
  text: string;
}

export interface RawAnalysisError {
  quote: string;
  tag: string;
  correction: string;
  explanation: string;
  severity: ErrorSeverity;
}

export interface RawScenarioFit {
  register_matched: boolean;
  register_comment: string;
  expressions_attempted: string[];
}

/** The model's own JSON, exactly as `lesson-analysis` v2's `response_schema` shapes it — before any of this file's rules apply. */
export interface RawAnalysisOutput {
  competencies: Record<AnalysisCompetency, { score: number; justification: string }>;
  strengths: string[];
  errors: RawAnalysisError[];
  recurring_tags: string[];
  scenario_fit: RawScenarioFit | null;
  topics_to_practice: string[];
}

export interface ProcessedAnalysisError {
  idx: number;
  quote: string;
  tag: string;
  correction: string;
  explanation: string;
  severity: ErrorSeverity;
  /** The owner's own utterance the quote was matched to; null when no match survived. */
  utteranceId: string | null;
}

export interface ProcessedScenarioFit {
  roleLabel: string;
  registerExpected: Register;
  registerMatched: boolean;
  registerComment: string;
  /** The card's own target expressions the model reported attempting. */
  expressionsUsed: string[];
  /** The rest of the card's target expressions — together with `expressionsUsed`, exactly the card's own list. */
  expressionsNotUsed: string[];
}

export type CuratorFlag = 'no_errors_long_lesson' | 'scenario_fit_missing';

export interface AnalysisOutputResult {
  errors: ProcessedAnalysisError[];
  discardedErrorCount: number;
  recurringTags: string[];
  scenarioFit: ProcessedScenarioFit | null;
  curatorFlags: CuratorFlag[];
}

export interface ProcessAnalysisOutputOptions {
  raw: RawAnalysisOutput;
  /** Every one of the owner's own utterances, whether or not the transcript kept them under the token budget. */
  ownUtterances: readonly OwnUtterance[];
  scenarioContext: ScenarioContext;
  roleLabel: string | null;
  registerExpected: Register | null;
  cardTargetExpressions: readonly string[];
  /** The profile port's own recurring weakness tags — what a `recurring_tags` entry must also belong to. */
  profileTags: readonly string[];
  lessonDurationSeconds: number | null;
  maxErrors: number;
}

/** NFKC, lowercased, curly quotes and dashes straightened, punctuation other than apostrophes stripped, whitespace collapsed. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a quote elided with `...` or `…` into its fragments, in order, dropping empty ones. */
function splitEllipsis(rawQuote: string): string[] {
  return rawQuote
    .split(/\.\.\.|…/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);
}

function fragmentsMatchInOrder(fragments: readonly string[], haystack: string): boolean {
  let cursor = 0;
  for (const fragment of fragments) {
    const normalized = normalizeForMatch(fragment);
    if (normalized.length === 0) {
      continue;
    }
    const index = haystack.indexOf(normalized, cursor);
    if (index === -1) {
      return false;
    }
    cursor = index + normalized.length;
  }
  return true;
}

export interface QuoteMatch {
  matched: boolean;
  utteranceId: string | null;
}

/**
 * Matches a model-returned quote against the owner's own utterances only —
 * a single one, or two consecutive ones (the recognizer sometimes splits a
 * sentence across an utterance boundary). Never matches against another
 * participant's words: `ownUtterances` never contains them. The first match
 * wins; its (first, for a pair) utterance id is what the error is stored
 * against.
 */
export function matchQuote(rawQuote: string, ownUtterances: readonly OwnUtterance[]): QuoteMatch {
  const fragments = splitEllipsis(rawQuote);
  if (fragments.length === 0) {
    return { matched: false, utteranceId: null };
  }

  for (const utterance of ownUtterances) {
    if (fragmentsMatchInOrder(fragments, normalizeForMatch(utterance.text))) {
      return { matched: true, utteranceId: utterance.id };
    }
  }

  for (let i = 0; i < ownUtterances.length - 1; i += 1) {
    const first = ownUtterances[i]!;
    const second = ownUtterances[i + 1]!;
    const haystack = `${normalizeForMatch(first.text)} ${normalizeForMatch(second.text)}`;
    if (fragmentsMatchInOrder(fragments, haystack)) {
      return { matched: true, utteranceId: first.id };
    }
  }

  return { matched: false, utteranceId: null };
}

/**
 * Applies every code-enforced rule to the model's raw output: the 25-error
 * cap (the schema itself cannot bound `errors[]` — see the Stage 2
 * live-check finding), verbatim quote matching with discards, de-duplication
 * of identical (quote, tag) pairs, the recurring-tag filter against the
 * profile's own tags, the scenario-fit partition (or its omission outside
 * `full`), and the curator flags. Pure — no I/O, no randomness.
 */
export function processAnalysisOutput(options: ProcessAnalysisOutputOptions): AnalysisOutputResult {
  const {
    raw,
    ownUtterances,
    scenarioContext,
    roleLabel,
    registerExpected,
    cardTargetExpressions,
    profileTags,
    lessonDurationSeconds,
    maxErrors,
  } = options;

  const errors: ProcessedAnalysisError[] = [];
  const seenQuoteTagPairs = new Set<string>();
  let discardedErrorCount = 0;

  for (const candidate of raw.errors.slice(0, maxErrors)) {
    const dedupeKey = `${normalizeForMatch(candidate.quote)}::${candidate.tag}`;
    if (seenQuoteTagPairs.has(dedupeKey)) {
      continue;
    }
    const match = matchQuote(candidate.quote, ownUtterances);
    if (!match.matched) {
      discardedErrorCount += 1;
      continue;
    }
    seenQuoteTagPairs.add(dedupeKey);
    errors.push({
      idx: errors.length,
      quote: candidate.quote,
      tag: candidate.tag,
      correction: candidate.correction,
      explanation: candidate.explanation,
      severity: candidate.severity,
      utteranceId: match.utteranceId,
    });
  }

  const keptTags = new Set(errors.map((error) => error.tag));
  const profileTagSet = new Set(profileTags);
  const recurringTags = [...new Set(raw.recurring_tags)].filter(
    (tag) => keptTags.has(tag) && profileTagSet.has(tag),
  );

  const curatorFlags: CuratorFlag[] = [];
  let scenarioFit: ProcessedScenarioFit | null = null;

  if (scenarioContext === 'full') {
    if (raw.scenario_fit) {
      const cardSet = new Set(cardTargetExpressions);
      const attemptedSet = new Set(raw.scenario_fit.expressions_attempted.filter((expr) => cardSet.has(expr)));
      scenarioFit = {
        roleLabel: roleLabel!,
        registerExpected: registerExpected!,
        registerMatched: raw.scenario_fit.register_matched,
        registerComment: raw.scenario_fit.register_comment,
        expressionsUsed: cardTargetExpressions.filter((expr) => attemptedSet.has(expr)),
        expressionsNotUsed: cardTargetExpressions.filter((expr) => !attemptedSet.has(expr)),
      };
    } else {
      curatorFlags.push('scenario_fit_missing');
    }
  }
  // `situation_only` and `none` never carry a fit, even if the model returned
  // one anyway — there is no card (or no scenario) to score it against.

  if (errors.length === 0 && lessonDurationSeconds !== null && lessonDurationSeconds > ANALYSIS_LONG_LESSON_SECONDS) {
    curatorFlags.push('no_errors_long_lesson');
  }

  return { errors, discardedErrorCount, recurringTags, scenarioFit, curatorFlags };
}
