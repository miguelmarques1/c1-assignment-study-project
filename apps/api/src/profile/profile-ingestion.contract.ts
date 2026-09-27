import { errorSeveritySchema, profileCompetencySchema } from '@english-quest/shared';
import { z } from 'zod';

import { PROFILE_SOURCE_KINDS } from './profile.constants';

/**
 * The inputs the profile engine accepts (F12). `ActivityOutcome` is the
 * outcome ingestion contract F16, F17 and F18 call in-process, inside their
 * own submission transactions; `ProfileSourceInput` is what every source —
 * lesson or activity — becomes before it is applied.
 */

/** Allowed clock skew for an activity's `occurredAt`. */
const FUTURE_TOLERANCE_MS = 60_000;

const scoreField = z.number().min(0).max(100);
/** Shape only; membership is checked against the taxonomy in force at ingestion, where unknown tags are rejected and logged. */
const tagField = z.string().min(3).max(64);
const dateField = z.union([z.date(), z.iso.datetime()]).transform((value) => new Date(value));

const measurementSchema = z
  .object({
    competency: profileCompetencySchema,
    value: scoreField,
    accuracy: scoreField.optional(),
    prosody: scoreField.nullable().optional(),
  })
  .refine(
    (measurement) =>
      measurement.competency === 'pronunciation' ||
      (measurement.accuracy === undefined && measurement.prosody === undefined),
    { message: 'accuracy and prosody are sub-scores of pronunciation only', path: ['accuracy'] },
  );

function uniqueBy<T>(key: (item: T) => string, message: string) {
  return (items: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const value = key(item);
      if (seen.has(value)) {
        ctx.addIssue({ code: 'custom', path: [index], message: `${message}: "${value}"` });
      }
      seen.add(value);
    });
  };
}

export const activityOutcomeSchema = z
  .object({
    /** The activity's owner, the only user written. */
    userId: z.uuid(),
    activityId: z.uuid(),
    /** Idempotency key, normally the attempt id. */
    sourceKey: z.uuid(),
    /** A new revision replaces the source; defaults to `sourceKey`. */
    revision: z.string().min(1).max(64).optional(),
    /** Logged and stored for the curator, e.g. `grammar` or `writing`. */
    activityType: z.string().min(1).max(32),
    occurredAt: dateField,
    measurements: z.array(measurementSchema).max(6).superRefine(uniqueBy((m) => m.competency, 'competency is listed twice')),
    errorOccurrences: z
      .array(
        z.object({
          tag: tagField,
          quote: z.string().min(1).max(500).optional(),
          correction: z.string().min(1).max(500).optional(),
          exampleWords: z.array(z.string().min(1).max(64)).max(5).optional(),
          instances: z.number().int().min(1).max(1_000).optional(),
        }),
      )
      .max(50),
    correctEncounters: z
      .array(z.object({ tag: tagField }))
      .max(50)
      .superRefine(uniqueBy((e) => e.tag, 'tag is listed twice')),
  })
  .superRefine((outcome, ctx) => {
    if (outcome.occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'must not be in the future' });
    }
  })
  .transform((outcome) => ({ ...outcome, revision: outcome.revision ?? outcome.sourceKey }));

export type ActivityOutcomeInput = z.input<typeof activityOutcomeSchema>;
export type ActivityOutcome = z.output<typeof activityOutcomeSchema>;

export const profileSourceInputSchema = z
  .object({
    userId: z.uuid(),
    kind: z.enum(PROFILE_SOURCE_KINDS),
    sourceKey: z.uuid(),
    revision: z.string().min(1).max(64),
    lessonId: z.uuid().nullable(),
    activityId: z.uuid().nullable(),
    occurredAt: z.date(),
    /** For the log line only (an activity's type). */
    label: z.string().max(32).nullable(),
    measurements: z
      .array(
        z.object({
          competency: profileCompetencySchema,
          value: scoreField,
          accuracy: scoreField.nullable(),
          prosody: scoreField.nullable(),
        }),
      )
      .max(6)
      .superRefine(uniqueBy((m) => m.competency, 'competency is listed twice')),
    occurrences: z.array(
      z.object({
        tag: tagField,
        quote: z.string().nullable(),
        correction: z.string().nullable(),
        severity: errorSeveritySchema.nullable(),
        exampleWords: z.array(z.string()).max(5),
        instances: z.number().int().min(1).max(32_767),
        analysisErrorId: z.uuid().nullable(),
        utteranceId: z.uuid().nullable(),
      }),
    ),
    encounters: z.array(z.object({ tag: tagField })).superRefine(uniqueBy((e) => e.tag, 'tag is listed twice')),
  })
  .superRefine((source, ctx) => {
    const lessonKind = source.kind !== 'activity';
    const coherent = lessonKind
      ? source.lessonId === source.sourceKey && source.activityId === null
      : source.activityId !== null && source.lessonId === null;
    if (!coherent) {
      ctx.addIssue({
        code: 'custom',
        path: ['kind'],
        message: 'a lesson source is keyed by its lesson; an activity source carries its activity',
      });
    }
    if (lessonKind && source.encounters.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['encounters'], message: 'correct encounters come only from activities' });
    }
    source.measurements.forEach((measurement, index) => {
      if (measurement.competency !== 'pronunciation' && (measurement.accuracy !== null || measurement.prosody !== null)) {
        ctx.addIssue({ code: 'custom', path: ['measurements', index], message: 'sub-scores belong to pronunciation only' });
      }
    });
  });

export type ProfileSourceInput = z.infer<typeof profileSourceInputSchema>;
export type ProfileSourceMeasurement = ProfileSourceInput['measurements'][number];
export type ProfileSourceOccurrence = ProfileSourceInput['occurrences'][number];

/** An activity outcome as the source the engine applies: its weight comes from the kind, never from the caller. */
export function activitySource(outcome: ActivityOutcome): ProfileSourceInput {
  return {
    userId: outcome.userId,
    kind: 'activity',
    sourceKey: outcome.sourceKey,
    revision: outcome.revision,
    lessonId: null,
    activityId: outcome.activityId,
    occurredAt: outcome.occurredAt,
    label: outcome.activityType,
    measurements: outcome.measurements.map((measurement) => ({
      competency: measurement.competency,
      value: measurement.value,
      accuracy: measurement.accuracy ?? null,
      prosody: measurement.prosody ?? null,
    })),
    occurrences: outcome.errorOccurrences.map((occurrence) => ({
      tag: occurrence.tag,
      quote: occurrence.quote ?? null,
      correction: occurrence.correction ?? null,
      severity: null,
      exampleWords: occurrence.exampleWords ?? [],
      instances: occurrence.instances ?? 1,
      analysisErrorId: null,
      utteranceId: null,
    })),
    encounters: outcome.correctEncounters.map((encounter) => ({ tag: encounter.tag })),
  };
}

export type IngestionOutcome = 'ingested' | 'replaced' | 'skipped';

export interface IngestionResult {
  outcome: IngestionOutcome;
  /** Tags outside the taxonomy in force, dropped from this source and recorded on its row. */
  rejectedTags: string[];
}
