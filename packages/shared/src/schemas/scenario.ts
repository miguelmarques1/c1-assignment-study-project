import { z } from 'zod';

/**
 * The PRD's fifteen domains, in its own order. A controlled vocabulary rather
 * than free text: rotation ("no domain within a participant's last 5
 * lessons") and F20's coverage counts are both exact only against a fixed
 * list, never against whatever wording the model chose that day.
 */
export const vocabularyDomainSchema = z.enum([
  'travel',
  'workplace negotiation',
  'healthcare',
  'housing',
  'technology ethics',
  'education',
  'food and hospitality',
  'media and news',
  'environment',
  'personal finance',
  'culture and the arts',
  'law and rights',
  'sport',
  'relationships',
  'science',
]);
export type VocabularyDomain = z.infer<typeof vocabularyDomainSchema>;

/**
 * A status on a row that exists from the moment the lesson opens, so F11 is
 * told explicitly that no scenario was in play (`failed`, `no_scenario`)
 * rather than left to infer it from an absent row.
 */
export const scenarioStatusSchema = z.enum(['pending', 'ready', 'failed', 'no_scenario']);
export type ScenarioStatus = z.infer<typeof scenarioStatusSchema>;

export const roleCardStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type RoleCardStatus = z.infer<typeof roleCardStatusSchema>;

export const registerSchema = z.enum(['formal', 'neutral', 'informal']);
export type Register = z.infer<typeof registerSchema>;

/** One seat in the shared situation. */
export const roleSchema = z.object({
  label: z.string(),
  relationship: z.string(),
});
export type Role = z.infer<typeof roleSchema>;

/** The shared situation — the only half of the scenario every participant sees. */
export const sharedSituationSchema = z.object({
  /** A short headline; null only on a situation generated before titles existed. */
  title: z.string().nullable(),
  setting: z.string(),
  premise: z.string(),
  roles: z.array(roleSchema).min(1),
  vocabularyDomain: vocabularyDomainSchema,
  discussionHooks: z.array(z.string()).min(3).max(5),
});
export type SharedSituation = z.infer<typeof sharedSituationSchema>;

/**
 * A participant's private card. Content fields are null until `status` is
 * `ready`; a `failed` card still leaves the participant their role label,
 * which lives on the view rather than here.
 */
export const roleCardSchema = z.object({
  status: roleCardStatusSchema,
  background: z.string().nullable(),
  objective: z.string().nullable(),
  constraint: z.string().nullable(),
  register: registerSchema.nullable(),
  targetExpressions: z.array(z.string()).nullable(),
});
export type RoleCard = z.infer<typeof roleCardSchema>;

/**
 * Response body of `GET /classroom/scenario` and of the reroll and retry
 * routes. `myCard` is only ever the caller's own card — there is deliberately
 * no field in which another participant's card could appear.
 */
export const scenarioViewSchema = z
  .object({
    lessonId: z.uuid(),
    status: scenarioStatusSchema,
    situation: sharedSituationSchema.nullable(),
    rerollsRemaining: z.number().int().min(0),
    canReroll: z.boolean(),
    myRoleLabel: z.string().nullable(),
    myCard: roleCardSchema.nullable(),
  })
  .nullable();
export type ScenarioView = z.infer<typeof scenarioViewSchema>;
