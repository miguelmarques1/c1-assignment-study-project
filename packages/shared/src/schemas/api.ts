import { z } from 'zod';

import { ERROR_CODES } from '../errors/codes';

/**
 * Response contracts that are not tied to a single feature. They live as Zod
 * schemas rather than bare interfaces so the OpenAPI document is generated from
 * the same definition the runtime validates against — a hand-written spec
 * drifts the first time someone forgets to update it.
 */

export const dependencyHealthSchema = z.object({
  name: z.enum(['postgres', 'redis', 'minio', 'livekit', 'egress']),
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nullable(),
  error: z.string().nullable(),
});

export const healthReportSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  dependencies: z.array(dependencyHealthSchema),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(Object.values(ERROR_CODES) as [string, ...string[]]),
    message: z.string(),
    details: z.unknown().nullable(),
  }),
});

export const validationDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});
