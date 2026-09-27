import { z } from 'zod';

/**
 * The learning profile and error ledger contract (F12). Every view is the
 * caller's own: no field can carry another participant's scores, tags or
 * quotes, and there is no user id anywhere in the shape.
 */

/** F11's five, then Pronunciation (F10), so its expansion never pushes other meters. */
export const profileCompetencySchema = z.enum([
  'grammar',
  'vocabulary',
  'fluency',
  'interaction',
  'comprehension',
  'pronunciation',
]);
export type ProfileCompetency = z.infer<typeof profileCompetencySchema>;

/** Across the last three measurements, with a 2-point dead band. Absent while warming up. */
export const competencyTrendSchema = z.enum(['up', 'down', 'flat']);
export type CompetencyTrend = z.infer<typeof competencyTrendSchema>;

export const competencySubScoresViewSchema = z.object({
  accuracy: z.number().int().min(0).max(100),
  /** Null when no measurement reported prosody (a locale Azure has none for). */
  prosody: z.number().int().min(0).max(100).nullable(),
});
export type CompetencySubScoresView = z.infer<typeof competencySubScoresViewSchema>;

export const competencySnapshotViewSchema = z.object({
  competency: profileCompetencySchema,
  /** The smoothed score, rounded half up; null with no measurement. */
  score: z.number().int().min(0).max(100).nullable(),
  /** `round(current) − round(previous)`; null with fewer than 2 measurements. */
  delta: z.number().int().nullable(),
  measurementCount: z.number().int().nonnegative(),
  /** Fewer than 3 measurements: the clients show `Warming up` in place of the number. */
  warmingUp: z.boolean(),
  trend: competencyTrendSchema.nullable(),
  lastMeasuredAt: z.iso.datetime().nullable(),
  /** Pronunciation only. */
  subScores: competencySubScoresViewSchema.nullable(),
});
export type CompetencySnapshotView = z.infer<typeof competencySnapshotViewSchema>;

/** Core writes `new` and `practicing`; `mastered` arrives with the mastery lifecycle (Full scope). */
export const ledgerStateSchema = z.enum(['new', 'practicing', 'mastered']);
export type LedgerState = z.infer<typeof ledgerStateSchema>;

/** Occurrences in the last 30 days against the 30 days before. */
export const tagTrendSchema = z.enum(['rising', 'falling', 'flat']);
export type TagTrend = z.infer<typeof tagTrendSchema>;

export const ledgerEntryViewSchema = z.object({
  /** What `GET /profile/ledger/:entryId` takes. */
  id: z.uuid(),
  tag: z.string(),
  /** The taxonomy's human-readable name, or the stored snapshot once the tag is retired. */
  label: z.string(),
  family: z.string(),
  occurrenceCount: z.number().int().positive(),
  /** Occurrences in the last 30 days. */
  recentOccurrenceCount: z.number().int().nonnegative(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  state: ledgerStateSchema,
  /** Always null until the spaced re-presentation schedule lands (Full scope). */
  dueAt: z.iso.datetime().nullable(),
  trend: tagTrendSchema,
  /** No longer in the taxonomy in force: read-only history, never ranked. */
  retired: z.boolean(),
});
export type LedgerEntryView = z.infer<typeof ledgerEntryViewSchema>;

/** Response body of `GET /profile` — the caller's own profile only. */
export const learningProfileViewSchema = z.object({
  /** For relative dates: clients format against it, not their own clock. */
  serverTime: z.iso.datetime(),
  /** The last applied source; null when nothing has been ingested. */
  updatedAt: z.iso.datetime().nullable(),
  /** No measurement and no ledger record. */
  empty: z.boolean(),
  /** Always six, in `profileCompetencySchema`'s order. */
  competencies: z.array(competencySnapshotViewSchema).length(6),
  /** Unmastered, non-retired tags with at least 3 occurrences in the last 30 days, ranked. */
  recurringWeaknesses: z.array(ledgerEntryViewSchema),
  /** Server-built sentences, such as the partial-update note. */
  notes: z.array(z.string()),
});
export type LearningProfileView = z.infer<typeof learningProfileViewSchema>;

/** Query of `GET /profile/ledger`: an optional exact tag, how a tag chip turns into an entry id. */
export const ledgerListQuerySchema = z.object({
  tag: z.string().min(3).max(64).optional(),
});
export type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

/** Response body of `GET /profile/ledger`. Non-retired records first, then retired, each by last seen. */
export const ledgerEntryListViewSchema = z.object({
  serverTime: z.iso.datetime(),
  entries: z.array(ledgerEntryViewSchema),
});
export type LedgerEntryListView = z.infer<typeof ledgerEntryListViewSchema>;

export const ledgerSourceKindSchema = z.enum(['lesson', 'activity']);
export type LedgerSourceKind = z.infer<typeof ledgerSourceKindSchema>;

export const ledgerExampleViewSchema = z.object({
  sourceKind: ledgerSourceKindSchema,
  lessonId: z.uuid().nullable(),
  activityId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
  /** The caller's own sentence; null for a pronunciation example. */
  quote: z.string().nullable(),
  correction: z.string().nullable(),
  /** A pronunciation example's words, up to 5. */
  exampleWords: z.array(z.string()),
  /** Failing instances behind a pronunciation example; 1 otherwise. */
  instances: z.number().int().positive(),
});
export type LedgerExampleView = z.infer<typeof ledgerExampleViewSchema>;

export const ledgerSourceViewSchema = z.object({
  sourceKind: ledgerSourceKindSchema,
  lessonId: z.uuid().nullable(),
  activityId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
  occurrences: z.number().int().positive(),
});
export type LedgerSourceView = z.infer<typeof ledgerSourceViewSchema>;

/** Response body of `GET /profile/ledger/:entryId` — one of the caller's own records. */
export const ledgerEntryDetailViewSchema = z.object({
  serverTime: z.iso.datetime(),
  entry: ledgerEntryViewSchema,
  /** Up to 5, most recent first. */
  examples: z.array(ledgerExampleViewSchema).max(5),
  /** Every lesson or activity with an occurrence of this tag, most recent first. */
  sources: z.array(ledgerSourceViewSchema),
});
export type LedgerEntryDetailView = z.infer<typeof ledgerEntryDetailViewSchema>;
