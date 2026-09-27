import { formatIssue, validateGeneratedInput } from '../../content/content-item.validation';
import type { LoadedErrorTaxonomy } from '../../taxonomy/error-taxonomy';
import {
  GATE_CHECKS,
  type GateCheckName,
  type GateFailure,
  type GateMetrics,
  type GateReport,
  type SlotSpec,
} from '../generation.contract';
import type { MappedItem } from '../generated-item.mapper';
import type { LoadedGenerationRules } from '../rules/generation-rules';
import type { LoadedFrequencyList } from '../text/frequency-list';
import { measureText, normalizeForMatch, normalizeQuote, words } from '../text/text-metrics';
import { containsWholeWords, verifyTargetStructures } from './target-structures';

/** Evidence must say enough to support an answer, and not be the whole text (spec A21). */
const MIN_EVIDENCE_WORDS = 4;
const MAX_EVIDENCE_WORDS = 60;

export interface GateContext {
  slot: SlotSpec;
  rules: LoadedGenerationRules;
  frequencyList: LoadedFrequencyList;
  taxonomy: LoadedErrorTaxonomy;
  /** The prompt's own `banned_phrases`, checked together with the rules file's shared list (spec A22). */
  promptBannedPhrases: readonly string[];
  /** Learner quotes and corrections that were sent in the prompt; none may be reproduced (spec §1, privacy). */
  learnerQuotes: readonly string[];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Each banned phrase found in the title or body, as whole words, with its count. */
export function findBannedPhrases(text: string, phrases: readonly string[]): Array<{ phrase: string; count: number }> {
  const haystack = normalizeForMatch(text);
  const unique = [...new Set(phrases.map(normalizeForMatch).filter((phrase) => phrase.length > 0))].sort();
  return unique.flatMap((phrase) => {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'gu');
    const count = haystack.match(pattern)?.length ?? 0;
    return count > 0 ? [{ phrase, count }] : [];
  });
}

/**
 * How many of the learner's strings reappear in the item: any run of `run`
 * consecutive words of a quote or correction, anywhere in the learner-visible
 * text. Generated items are shared across participants, so one owner's
 * sentences must never travel in them (spec §1, privacy decision).
 */
export function reproducedLearnerStrings(itemText: string, learnerStrings: readonly string[], run: number): number {
  const haystack = ` ${words(normalizeForMatch(itemText)).join(' ')} `;
  return learnerStrings.filter((learner) => {
    const tokens = words(normalizeForMatch(learner));
    for (let start = 0; start + run <= tokens.length; start += 1) {
      if (haystack.includes(` ${tokens.slice(start, start + run).join(' ')} `)) {
        return true;
      }
    }
    return false;
  }).length;
}

function learnerVisibleText(mapped: MappedItem): string {
  const parts = [mapped.input.title, mapped.input.body];
  for (const question of mapped.modelQuestions) {
    parts.push(question.prompt, question.explanation, ...(question.options ?? []), question.answer ?? '', ...(question.accepted_answers ?? []));
  }
  return parts.join('\n');
}

function evidenceIssues(mapped: MappedItem): string[] {
  const body = normalizeForMatch(mapped.input.body);
  return mapped.modelQuestions.flatMap((question, index) => {
    const label = `question ${index + 1}`;
    const evidence = normalizeQuote(question.evidence);
    const count = words(evidence).length;
    if (count < MIN_EVIDENCE_WORDS) {
      return [`${label}: evidence has ${count} words; at least ${MIN_EVIDENCE_WORDS} are required`];
    }
    if (count > MAX_EVIDENCE_WORDS) {
      return [`${label}: evidence has ${count} words; at most ${MAX_EVIDENCE_WORDS} are allowed`];
    }
    if (!containsWholeWords(body, evidence)) {
      return [`${label}: evidence is not a verbatim quote from the text`];
    }
    if (question.format === 'fill_blank') {
      const accepted = (question.accepted_answers ?? []).map(normalizeQuote).filter((answer) => answer.length > 0);
      if (!accepted.some((answer) => containsWholeWords(evidence, answer))) {
        return [`${label}: evidence does not contain any accepted answer`];
      }
    }
    return [];
  });
}

/**
 * The deterministic difficulty gate (PRD F14): every check runs on every
 * attempt, and all failures are reported together with the full metrics,
 * so a curator can see why an item passed or failed and a regeneration can
 * be told everything at once. No AI call; no I/O. Pure.
 */
export function evaluateGate(mapped: MappedItem, context: GateContext): GateReport {
  const { slot, rules: loaded, frequencyList, taxonomy } = context;
  const rules = loaded.rules;
  const typeRules = rules.itemTypes[slot.type];
  const failures: GateFailure[] = [];

  const measured = measureText(mapped.input.body, frequencyList, rules.frequencyRankCutoff);

  if (measured.wordCount < typeRules.words.min || measured.wordCount > typeRules.words.max) {
    failures.push({ check: 'word_count', measured: measured.wordCount, ...typeRules.words });
  }
  const msl = measured.meanSentenceLength;
  if (msl < typeRules.meanSentenceLength.min || msl > typeRules.meanSentenceLength.max) {
    failures.push({ check: 'mean_sentence_length', measured: msl, ...typeRules.meanSentenceLength });
  }
  if (measured.typeTokenRatio < typeRules.minTypeTokenRatio) {
    failures.push({ check: 'type_token_ratio', measured: measured.typeTokenRatio, min: typeRules.minTypeTokenRatio });
  }
  if (measured.outOfFrequencyRatio < typeRules.minOutOfFrequencyRatio) {
    failures.push({
      check: 'out_of_frequency_ratio',
      measured: measured.outOfFrequencyRatio,
      min: typeRules.minOutOfFrequencyRatio,
      cutoff: rules.frequencyRankCutoff,
    });
  }

  const structures = verifyTargetStructures(mapped.input.body, slot.targetTags, mapped.occurrences, loaded.markers);
  const weakTags = slot.targetTags.flatMap((tag) => {
    const entry = structures[tag] ?? { occurrences: 0, thirds: [], rejected: [] };
    const short = entry.occurrences < typeRules.minStructureOccurrences || entry.thirds.length < rules.minOccurrenceThirds;
    return short
      ? [
          {
            tag,
            occurrences: entry.occurrences,
            thirds: entry.thirds.length,
            rejected: entry.rejected.length,
            minOccurrences: typeRules.minStructureOccurrences,
            minThirds: rules.minOccurrenceThirds,
          },
        ]
      : [];
  });
  if (weakTags.length > 0) {
    failures.push({ check: 'target_structures', tags: weakTags });
  }

  const banned = findBannedPhrases(`${mapped.input.title}\n${mapped.input.body}`, [
    ...rules.bannedPhrases,
    ...context.promptBannedPhrases,
  ]);
  if (banned.length > 0) {
    failures.push({ check: 'banned_phrases', found: banned });
  }

  // F13's own validation decides question and item shape, so nothing reaches
  // `saveGenerated` that it would refuse. The metrics placeholder is replaced below.
  const validation = validateGeneratedInput({ ...mapped.input, gateMetrics: { pending: true } }, taxonomy);
  const bankIssues = validation.ok ? [] : validation.issues;

  const questionIssues: string[] = [];
  const count = mapped.modelQuestions.length;
  if (count !== rules.questions.count) {
    questionIssues.push(`the item has ${count} questions; exactly ${rules.questions.count} are required`);
  }
  mapped.modelQuestions.forEach((question, index) => {
    if (!(rules.questions.formats as readonly string[]).includes(question.format)) {
      questionIssues.push(`question ${index + 1}: format "${question.format}" is not one of ${rules.questions.formats.join(', ')}`);
    }
  });
  questionIssues.push(
    ...bankIssues
      .filter((issue) => issue.path.startsWith('/questions') && !(count !== rules.questions.count && issue.path === '/questions'))
      .map(formatIssue),
  );
  if (questionIssues.length > 0) {
    failures.push({ check: 'questions', issues: questionIssues });
  }

  const evidence = evidenceIssues(mapped);
  if (evidence.length > 0) {
    failures.push({ check: 'answer_evidence', issues: evidence });
  }

  const shapeIssues = bankIssues
    .filter((issue) => !issue.path.startsWith('/questions') && !issue.path.startsWith('/gateMetrics'))
    .map(formatIssue);
  if (shapeIssues.length > 0) {
    failures.push({ check: 'item_shape', issues: shapeIssues });
  }

  const reproduced = reproducedLearnerStrings(learnerVisibleText(mapped), context.learnerQuotes, rules.learnerQuoteRunWords);
  if (reproduced > 0) {
    failures.push({ check: 'learner_quotes', reproduced });
  }

  const failedChecks = GATE_CHECKS.filter((check) => failures.some((failure) => failure.check === check));
  const checks = Object.fromEntries(
    GATE_CHECKS.map((check) => [check, failedChecks.includes(check) ? 'fail' : 'pass']),
  ) as Record<GateCheckName, 'pass' | 'fail'>;

  const metrics: GateMetrics = {
    rules_version: loaded.version,
    frequency_list: frequencyList.version,
    attempt: slot.attempt,
    genre: slot.genre,
    topic_domain: slot.topicDomain,
    exemplar_index: slot.exemplarIndex,
    word_count: measured.wordCount,
    sentence_count: measured.sentenceCount,
    mean_sentence_length: round(measured.meanSentenceLength, 2),
    type_token_ratio: round(measured.typeTokenRatio, 3),
    out_of_frequency_ratio: round(measured.outOfFrequencyRatio, 3),
    frequency_bands: {
      k1: round(measured.frequencyBands.k1, 3),
      k2: round(measured.frequencyBands.k2, 3),
      k3: round(measured.frequencyBands.k3, 3),
      k4_5: round(measured.frequencyBands.k4_5, 3),
      off_list: round(measured.frequencyBands.off_list, 3),
    },
    target_structures: Object.fromEntries(
      Object.entries(structures).map(([tag, entry]) => [
        tag,
        { occurrences: entry.occurrences, thirds: entry.thirds, rejected: entry.rejected.length },
      ]),
    ),
    banned_phrases_found: banned,
    questions: count,
    checks,
  };
  const evidenceQuotes = mapped.modelQuestions.map((question) => question.evidence.trim());

  const passed = failedChecks.length === 0 && validation.ok;
  return {
    passed,
    failedChecks,
    failures,
    metrics,
    evidence: evidenceQuotes,
    item:
      passed && validation.ok
        ? { ...validation.value, gateMetrics: { ...metrics, answer_evidence: evidenceQuotes } as unknown as Record<string, unknown> }
        : null,
  };
}
