import { vocabularyDomainSchema, type VocabularyDomain } from '@english-quest/shared';

/**
 * The PRD's 15 domains, sourced from the shared contract so this list and the
 * one both clients validate responses against can never drift apart.
 */
export const VOCABULARY_DOMAINS: readonly VocabularyDomain[] = vocabularyDomainSchema.options;

/** The opener may reroll the situation up to this many times before the lesson starts. */
export const REROLL_LIMIT = 3;

/** "No domain repeated within a participant's last 5 lessons." */
export const HISTORY_WINDOW_LESSONS = 5;
