import type { OpenResponseEntry, ReadAloudEntry } from '../corpus/speaking-corpus';
import { RECENT_TASK_DAYS } from '../speaking.constants';

const RECENT_TASK_MS = RECENT_TASK_DAYS * 24 * 60 * 60 * 1000;

export interface UsageInput {
  /** Per owner, the corpus entry's most recent use — from `speaking_tasks.created_at` grouped by `corpus_entry_id`. */
  usage: ReadonlyMap<string, Date>;
  now: Date;
}

/** Not used by this owner in the last 14 days, ranked ahead of everything used more recently (A4). */
function notRecentlyUsed(entryId: string, input: UsageInput): boolean {
  const lastUsed = input.usage.get(entryId);
  return lastUsed === undefined || input.now.getTime() - lastUsed.getTime() >= RECENT_TASK_MS;
}

/** Never used sorts as the earliest possible use, so it always wins "least recently used" ties. */
function lastUsedMs(entryId: string, input: UsageInput): number {
  return input.usage.get(entryId)?.getTime() ?? -Infinity;
}

export interface ReadAloudSelectionInput extends UsageInput {
  /** The activity's own `phoneme:` target tags. Empty for a general-mode or filler task. */
  targetTags: readonly string[];
  /** The owner's unmastered `phoneme:` tags other than the activity's own targets (F12). */
  unmasteredPhonemes: readonly string[];
}

export interface TaskSelection {
  entryId: string;
  focusTags: string[];
}

function readAloudFocusTags(entry: ReadAloudEntry, input: ReadAloudSelectionInput): string[] {
  const drillTags = Object.keys(entry.drills);
  const targeted = drillTags.filter((tag) => input.targetTags.includes(tag));
  if (targeted.length > 0) {
    return targeted.slice(0, 3);
  }
  const unmastered = drillTags.filter((tag) => input.unmasteredPhonemes.includes(tag));
  if (unmastered.length > 0) {
    return unmastered.slice(0, 3);
  }
  return drillTags.slice(0, 3);
}

/**
 * Picks a read-aloud passage deterministically (A4): most of the activity's
 * own target phonemes first, then most of the owner's other unmastered
 * phonemes, then unused in the last 14 days, then least recently used, then
 * corpus order. An activity with no target tags (general mode or a filler
 * task) skips the first key entirely, since every passage ties on it.
 */
export function selectReadAloud(entries: readonly ReadAloudEntry[], input: ReadAloudSelectionInput): TaskSelection {
  const targetSet = new Set(input.targetTags);
  const otherUnmastered = input.unmasteredPhonemes.filter((tag) => !targetSet.has(tag));
  const unmasteredSet = new Set(otherUnmastered);

  const ranked = entries
    .map((entry, index) => {
      const drillTags = Object.keys(entry.drills);
      return {
        entry,
        index,
        targetHits: targetSet.size === 0 ? 0 : drillTags.filter((tag) => targetSet.has(tag)).length,
        unmasteredHits: drillTags.filter((tag) => unmasteredSet.has(tag)).length,
        notRecent: notRecentlyUsed(entry.id, input),
        lastUsedMs: lastUsedMs(entry.id, input),
      };
    })
    .sort(
      (a, b) =>
        b.targetHits - a.targetHits ||
        b.unmasteredHits - a.unmasteredHits ||
        Number(b.notRecent) - Number(a.notRecent) ||
        a.lastUsedMs - b.lastUsedMs ||
        a.index - b.index,
    );

  const winner = ranked[0]!.entry;
  return { entryId: winner.id, focusTags: readAloudFocusTags(winner, { ...input, unmasteredPhonemes: otherUnmastered }) };
}

export interface OpenResponseSelectionInput extends UsageInput {
  /** The activity's own analysis-family target tags. Empty for a general-mode or filler task. */
  targetTags: readonly string[];
}

/**
 * Picks an open-response prompt deterministically (A4): most of the
 * activity's targets among the prompt's own, then unused in the last 14
 * days, then least recently used, then corpus order. `focusTags` is the
 * intersection actually shown to the learner.
 */
export function selectOpenResponse(entries: readonly OpenResponseEntry[], input: OpenResponseSelectionInput): TaskSelection {
  const targetSet = new Set(input.targetTags);

  const ranked = entries
    .map((entry, index) => ({
      entry,
      index,
      targetHits: targetSet.size === 0 ? 0 : entry.targets.filter((tag) => targetSet.has(tag)).length,
      notRecent: notRecentlyUsed(entry.id, input),
      lastUsedMs: lastUsedMs(entry.id, input),
    }))
    .sort(
      (a, b) =>
        b.targetHits - a.targetHits ||
        Number(b.notRecent) - Number(a.notRecent) ||
        a.lastUsedMs - b.lastUsedMs ||
        a.index - b.index,
    );

  const winner = ranked[0]!.entry;
  return { entryId: winner.id, focusTags: winner.targets.filter((tag) => targetSet.has(tag)) };
}
