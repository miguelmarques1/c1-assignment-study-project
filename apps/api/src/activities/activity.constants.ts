import {
  ACTIVITY_SKIP_REASON_MAX_CHARS,
  OBJECTIVE_FILL_ANSWER_MAX_CHARS,
  OBJECTIVE_TIME_SPENT_MAX_SECONDS,
  type ProfileCompetency,
} from '@english-quest/shared';

import { PROFILE_TRANSACTION_TIMEOUT_MS } from '../profile/profile.constants';

/** The five bank-backed kinds F15 places in a plan; the other three are task kinds with their own runners. */
export const OBJECTIVE_KINDS = ['listening', 'reading', 'vocabulary', 'grammar', 'error_review'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export function isObjectiveKind(kind: string): kind is ObjectiveKind {
  return (OBJECTIVE_KINDS as readonly string[]).includes(kind);
}

/** Ordering and matching are validated and stored by F13 but graded only in F16's Full scope (A2). */
export const CORE_QUESTION_FORMATS = ['multiple_choice', 'fill_blank'] as const;

export const TIME_SPENT_MAX_SECONDS = OBJECTIVE_TIME_SPENT_MAX_SECONDS;
export const SKIP_REASON_MAX_CHARS = ACTIVITY_SKIP_REASON_MAX_CHARS;
export const FILL_ANSWER_MAX_CHARS = OBJECTIVE_FILL_ANSWER_MAX_CHARS;

/** The input box is sized to the longest accepted answer, clamped to this range. */
export const BLANK_LENGTH_RANGE = { min: 4, max: 40 } as const;

/** What a finished objective activity measures (A14). `error_review` is derived from its tags' families. */
export const KIND_COMPETENCY: Record<Exclude<ObjectiveKind, 'error_review'>, ProfileCompetency> = {
  grammar: 'grammar',
  vocabulary: 'vocabulary',
  listening: 'comprehension',
  reading: 'comprehension',
};

/** Taxonomy families to the competency a text question can measure. Pronunciation comes only from Azure. */
export const FAMILY_COMPETENCY: Record<string, ProfileCompetency | null> = {
  grammar: 'grammar',
  vocab: 'vocabulary',
  discourse: 'interaction',
  phoneme: null,
};

/** A quote or correction carries a sentence the size of one prompt plus one answer. */
export const OUTCOME_TEXT_MAX_CHARS = 500;

export const MEDIA_CACHE_CONTROL = 'private, max-age=3600';

export const SUBMISSION_TRANSACTION_TIMEOUT_MS = PROFILE_TRANSACTION_TIMEOUT_MS;
