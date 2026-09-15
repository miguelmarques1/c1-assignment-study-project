import {
  apiErrorSchema,
  changePasswordSchema,
  currentUserSchema,
  healthReportSchema,
  loginSchema,
  maskedCredentialListSchema,
  maskedCredentialSchema,
  publicUserSchema,
  saveCredentialSchema,
  sessionTokenSchema,
  validationDetailSchema,
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
};

/** Shorthand for the error responses, which every route can return. */
export const ERROR_RESPONSE = {
  schema: { $ref: '#/components/schemas/ErrorEnvelope' },
} as const;
