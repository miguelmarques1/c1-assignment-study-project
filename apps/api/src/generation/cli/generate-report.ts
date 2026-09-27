import type { GateFailure, GenerationRunResult, GenerationSlotResult, PlannedSlotPreview } from '../generation.contract';

/** One recorded attempt, as the report reads it back. */
export interface ReportAttempt {
  attempt: number;
  outcome: string;
  failedChecks: string[];
  failures: GateFailure[];
  wordCount: number | null;
  outOfFrequencyRatio: number | null;
}

export interface ReportSlot extends GenerationSlotResult {
  attemptsDetail: ReportAttempt[];
  /** Slug of the generated item or the curated fallback. */
  itemSlug: string | null;
}

const TYPE_WIDTH = 13;
const TAGS_WIDTH = 42;

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text.padEnd(width);
}

/** A failed check in a few words, with its number where it has one. */
export function describeFailure(failure: GateFailure): string {
  switch (failure.check) {
    case 'word_count':
      return `word_count ${failure.measured} not in ${failure.min}–${failure.max}`;
    case 'mean_sentence_length':
      return `mean_sentence_length ${failure.measured.toFixed(1)} not in ${failure.min}–${failure.max}`;
    case 'type_token_ratio':
      return `type_token_ratio ${failure.measured.toFixed(3)} < ${failure.min}`;
    case 'out_of_frequency_ratio':
      return `out_of_frequency_ratio ${percent(failure.measured)} < ${percent(failure.min)}`;
    default:
      return failure.check;
  }
}

function describeAttempt(attempt: ReportAttempt): string {
  if (attempt.outcome !== 'gate_failed') {
    return attempt.outcome;
  }
  return attempt.failures.length > 0 ? attempt.failures.map(describeFailure).join(', ') : attempt.failedChecks.join(', ');
}

function lead(symbol: string, slot: ReportSlot): string {
  return `${symbol} ${String(slot.position).padStart(2)} ${pad(slot.type, TYPE_WIDTH)}${pad(slot.targetTags.join(', '), TAGS_WIDTH)}`;
}

/** The line for one finished slot (spec §5). Never any item text. */
export function renderSlotLine(slot: ReportSlot): string {
  const passed = slot.attemptsDetail.find((attempt) => attempt.outcome === 'passed');
  if (slot.outcome === 'generated' && passed) {
    const numbers = [
      passed.wordCount !== null ? `${passed.wordCount} words` : null,
      passed.outOfFrequencyRatio !== null ? `OOF ${percent(passed.outOfFrequencyRatio)}` : null,
      slot.itemSlug,
    ].filter((part): part is string => part !== null);
    if (passed.attempt === 1) {
      return `${lead('✓', slot)}passed on attempt 1 · ${numbers.join(' · ')}`;
    }
    const first = slot.attemptsDetail.find((attempt) => attempt.attempt === 1);
    return `${lead('↻', slot)}passed on attempt ${passed.attempt} (attempt 1: ${first ? describeAttempt(first) : 'unknown'}) · ${numbers.join(' · ')}`;
  }

  const why =
    slot.attemptsDetail.length === 0
      ? `not generated (${slot.reason ?? 'unknown'})`
      : slot.attemptsDetail.length >= 2
        ? `failed twice (${slot.attemptsDetail.map((attempt) => (attempt.outcome === 'gate_failed' ? attempt.failedChecks.join(', ') : attempt.outcome)).join('; ')})`
        : `failed (${describeAttempt(slot.attemptsDetail[0]!)}; run stopped: ${slot.reason ?? 'unknown'})`;
  if (slot.outcome === 'fallback') {
    return `${lead('✗', slot)}${why} → curated ${slot.itemSlug ?? slot.contentItemId ?? '?'}`;
  }
  return `${lead('–', slot)}${why} → dropped: no curated ${slot.type} item`;
}

export function renderSummary(result: GenerationRunResult): string {
  const { planned, generated, fallback, dropped } = result.counts;
  const notes = result.notes.length > 0 ? result.notes.map((note) => note.text).join(' ') : 'none';
  if (planned === 0) {
    return `Nothing planned: the ledger holds no unmastered grammar, vocabulary or discourse tag. Notes: ${notes}`;
  }
  return `${planned} planned: ${generated} generated, ${fallback} fallback, ${dropped} dropped. Notes: ${notes}`;
}

export function renderHeader(email: string, maxItems: number, keyStatus: string, runKey: string): string {
  return `Generating up to ${maxItems} items for ${email} (Gemini key: ${keyStatus}), run ${runKey}`;
}

export function renderDryRun(email: string, slots: readonly PlannedSlotPreview[]): string[] {
  if (slots.length === 0) {
    return ['Dry run — nothing was generated or written.', `Nothing would be planned for ${email}: no unmastered grammar, vocabulary or discourse tag.`];
  }
  return [
    'Dry run — nothing was generated or written.',
    `${slots.length} slots would be planned for ${email}:`,
    ...slots.map((slot) => {
      const tags = slot.tagSources.map((source) => `${source.tag} (${source.source} #${source.rank})`).join(', ');
      const genre = slot.genre ? ` · genre: ${slot.genre}` : '';
      return `  ${String(slot.position).padStart(2)} ${pad(slot.type, TYPE_WIDTH)}${tags}${genre} · domain: ${slot.topicDomain} · exemplar ${slot.exemplarIndex + 1}`;
    }),
  ];
}
