import { z } from 'zod';

import { registerSchema } from './scenario';

/** The PRD's five competencies scored by the LLM analysis (F11). Pronunciation is Azure's, not the model's (F10, F12). */
export const analysisCompetencySchema = z.enum([
  'grammar',
  'vocabulary',
  'fluency',
  'interaction',
  'comprehension',
]);
export type AnalysisCompetency = z.infer<typeof analysisCompetencySchema>;

export const errorSeveritySchema = z.enum(['minor', 'moderate', 'major']);
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>;

/**
 * How much of the scenario was available to the analysis (F11). `full` is
 * the only context that ever carries a `scenarioFit` block: the fit needs
 * both the register and the target expressions a card alone provides.
 */
export const scenarioContextSchema = z.enum(['full', 'situation_only', 'none']);
export type ScenarioContext = z.infer<typeof scenarioContextSchema>;

export const analysisCompetencyViewSchema = z.object({
  competency: analysisCompetencySchema,
  score: z.number().int().min(0).max(100),
  justification: z.string(),
  /** Against the caller's own previous analysed lesson; null on their first. */
  delta: z.number().int().nullable(),
});
export type AnalysisCompetencyView = z.infer<typeof analysisCompetencyViewSchema>;

export const analysisErrorViewSchema = z.object({
  quote: z.string(),
  correction: z.string(),
  explanation: z.string(),
  severity: errorSeveritySchema,
  tag: z.string(),
  tagLabel: z.string(),
  recurring: z.boolean(),
  /** The caller's own utterance the quote was matched to; null once the transcript has been replaced. */
  utteranceId: z.uuid().nullable(),
});
export type AnalysisErrorView = z.infer<typeof analysisErrorViewSchema>;

/**
 * Only ever present for `scenarioContext: 'full'`. `expressionsUsed` and
 * `expressionsNotUsed` together partition the caller's own role card's
 * target expressions exactly — nothing the model reports outside that list
 * ever appears here (F06).
 */
export const scenarioFitViewSchema = z.object({
  roleLabel: z.string(),
  registerExpected: registerSchema,
  registerMatched: z.boolean(),
  registerComment: z.string(),
  expressionsUsed: z.array(z.string()),
  expressionsNotUsed: z.array(z.string()),
});
export type ScenarioFitView = z.infer<typeof scenarioFitViewSchema>;

/** The caller's own state at `GET /lessons/:lessonId/analysis` (F11). */
export const lessonAnalysisStatusSchema = z.enum(['pending', 'ready', 'failed', 'unavailable']);
export type LessonAnalysisStatus = z.infer<typeof lessonAnalysisStatusSchema>;

export const lessonAnalysisResultSchema = z.object({
  competencies: z.array(analysisCompetencyViewSchema).length(5),
  strengths: z.array(z.string()).min(3).max(5),
  errors: z.array(analysisErrorViewSchema),
  recurringTags: z.array(z.string()),
  scenarioContext: scenarioContextSchema,
  scenarioFit: scenarioFitViewSchema.nullable(),
  topicsToPractice: z.array(z.string()).min(3).max(6),
  notes: z.array(z.string()),
  analyzedAt: z.iso.datetime(),
});
export type LessonAnalysisResult = z.infer<typeof lessonAnalysisResultSchema>;

/** Response body of `GET /lessons/:lessonId/analysis` — the caller's own data only. */
export const lessonAnalysisViewSchema = z.object({
  lessonId: z.uuid(),
  status: lessonAnalysisStatusSchema,
  analysis: lessonAnalysisResultSchema.nullable(),
});
export type LessonAnalysisView = z.infer<typeof lessonAnalysisViewSchema>;
