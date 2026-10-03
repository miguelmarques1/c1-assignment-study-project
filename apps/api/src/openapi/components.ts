import {
  apiErrorSchema,
  changePasswordSchema,
  classroomEndResultSchema,
  classroomSessionSchema,
  classroomTokenSchema,
  currentPlanViewSchema,
  currentUserSchema,
  healthReportSchema,
  learningProfileViewSchema,
  ledgerEntryDetailViewSchema,
  ledgerEntryListViewSchema,
  lessonAnalysisViewSchema,
  lessonDetailViewSchema,
  lessonListSchema,
  lessonPipelineViewSchema,
  lessonPronunciationViewSchema,
  lessonRecordingViewSchema,
  lessonScenarioViewSchema,
  lessonTranscriptViewSchema,
  loginSchema,
  maskedCredentialListSchema,
  maskedCredentialSchema,
  planHistoryViewSchema,
  publicUserSchema,
  saveCredentialSchema,
  saveWritingDraftSchema,
  scenarioViewSchema,
  sessionTokenSchema,
  speakingActivityViewSchema,
  speakingAttemptViewSchema,
  speakingRatingInputSchema,
  speakingRatingViewSchema,
  studyPlanViewSchema,
  submitWritingSchema,
  validationDetailSchema,
  writingActivityViewSchema,
  writingDraftConflictDetailsSchema,
  writingDraftSavedSchema,
  writingLimitDetailsSchema,
} from '@english-quest/shared';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z, type ZodType } from 'zod';

/**
 * OpenAPI components derived from the Zod contracts in @english-quest/shared.
 *
 * Nothing here is hand-written: a schema described by hand drifts from the one
 * the API actually enforces the first time somebody edits only one of them.
 * Zod 4 emits JSON Schema natively, so the document is always a projection of
 * the runtime contract.
 */

/** OpenAPI components reject the `$schema` key that Zod emits. */
function toOpenApi(schema: ZodType, io: 'input' | 'output' = 'input'): SchemaObject {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  return rest as SchemaObject;
}

/** Wraps a component reference in the success envelope every 2xx body uses. */
export function dataEnvelope(componentName: string): SchemaObject {
  return {
    type: 'object',
    required: ['data'],
    properties: {
      data: { $ref: `#/components/schemas/${componentName}` },
    },
  };
}

export const OPENAPI_COMPONENTS: Record<string, SchemaObject> = {
  LoginRequest: toOpenApi(loginSchema, 'input'),
  ChangePasswordRequest: toOpenApi(changePasswordSchema, 'input'),
  PublicUser: toOpenApi(publicUserSchema, 'output'),
  CurrentUser: toOpenApi(currentUserSchema, 'output'),
  SessionToken: toOpenApi(sessionTokenSchema, 'output'),
  HealthReport: toOpenApi(healthReportSchema, 'output'),
  SaveCredentialRequest: toOpenApi(saveCredentialSchema, 'input'),
  MaskedCredential: toOpenApi(maskedCredentialSchema, 'output'),
  MaskedCredentialList: toOpenApi(maskedCredentialListSchema, 'output'),
  ValidationDetail: toOpenApi(validationDetailSchema, 'output'),
  ErrorEnvelope: toOpenApi(apiErrorSchema, 'output'),
  ClassroomToken: toOpenApi(classroomTokenSchema, 'output'),
  ClassroomSession: toOpenApi(classroomSessionSchema, 'output'),
  ClassroomEndResult: toOpenApi(classroomEndResultSchema, 'output'),
  ScenarioView: toOpenApi(scenarioViewSchema, 'output'),
  LessonRecordingView: toOpenApi(lessonRecordingViewSchema, 'output'),
  LessonPipelineView: toOpenApi(lessonPipelineViewSchema, 'output'),
  LessonTranscriptView: toOpenApi(lessonTranscriptViewSchema, 'output'),
  LessonPronunciationView: toOpenApi(lessonPronunciationViewSchema, 'output'),
  LessonAnalysisView: toOpenApi(lessonAnalysisViewSchema, 'output'),
  LessonList: toOpenApi(lessonListSchema, 'output'),
  LessonDetailView: toOpenApi(lessonDetailViewSchema, 'output'),
  LessonScenarioView: toOpenApi(lessonScenarioViewSchema, 'output'),
  LearningProfileView: toOpenApi(learningProfileViewSchema, 'output'),
  LedgerEntryListView: toOpenApi(ledgerEntryListViewSchema, 'output'),
  LedgerEntryDetailView: toOpenApi(ledgerEntryDetailViewSchema, 'output'),
  CurrentPlanView: toOpenApi(currentPlanViewSchema, 'output'),
  StudyPlanView: toOpenApi(studyPlanViewSchema, 'output'),
  PlanHistoryView: toOpenApi(planHistoryViewSchema, 'output'),
  WritingActivityView: toOpenApi(writingActivityViewSchema, 'output'),
  SaveWritingDraftRequest: toOpenApi(saveWritingDraftSchema, 'input'),
  WritingDraftSaved: toOpenApi(writingDraftSavedSchema, 'output'),
  SubmitWritingRequest: toOpenApi(submitWritingSchema, 'input'),
  WritingLimitDetails: toOpenApi(writingLimitDetailsSchema, 'output'),
  WritingDraftConflictDetails: toOpenApi(writingDraftConflictDetailsSchema, 'output'),
  SpeakingActivityView: toOpenApi(speakingActivityViewSchema, 'output'),
  SpeakingAttemptView: toOpenApi(speakingAttemptViewSchema, 'output'),
  SpeakingRatingRequest: toOpenApi(speakingRatingInputSchema, 'input'),
  SpeakingRatingView: toOpenApi(speakingRatingViewSchema, 'output'),
};

/** Shorthand for the error responses, which every route can return. */
export const ERROR_RESPONSE = {
  schema: { $ref: '#/components/schemas/ErrorEnvelope' },
} as const;
